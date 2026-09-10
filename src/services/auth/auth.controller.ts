import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import BaseController from '../base/base.controller';
import AuthModel from './auth.model';
import supplierRemoveRequestModel from '../supplier.remove.requests/supplier.remove.request.model';
import userModel from '../users/user.model';

class AuthController extends BaseController {
  constructor() {
    super(AuthModel, []);
  }

  async register(req: Request, res: Response) {
    try {
      // const { firstName, lastName, email, phoneNumber, companyName, password } = req.body;
      const existing = await userModel.findOne({ email: req.body.email });
      if (existing) throw new Error(this.ERRORS.CONFLICT);
      const user = new userModel({
        ...req.body,
      });
      const savedUser = await user.save();
      const tokens = this.jwt.createTokens({
        _id: savedUser._id,
        roles: savedUser.roles,
      });
      this.logger.info(`User registered: ${savedUser._id}`);

      const auth = new this.model({
        userId: savedUser._id,
        refreshToken: tokens.refreshToken,
      });

      await auth.save();
      this.logger.info(`Auth created for user: ${savedUser._id}`);

      this.broker.emit('user:registered', {
        to: savedUser.email,
        subject: 'Welcome to our Order Pool!',
        text: `Hello ${savedUser.firstName}, welcome to our service!`,
        // html: `<p>Hello ${savedUser.firstName}, welcome to our service!</p>`,
      });

      res.status(201).send({
        message: 'User registered successfully',
        ...tokens,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  async login(req: Request, res: Response) {
    // rotate refresh token
    try {
      const { email, password } = req.body;
      const user = await userModel.findOne({ email });
      if (!user) throw new Error(this.ERRORS.USER_NOT_FOUND);

      if (!this.hasher.compareSync(password, user.password))
        throw new Error(this.ERRORS.INVALID_CREDENTIALS);
      const tokens = this.jwt.createTokens({
        _id: user._id,
        roles: user.roles,
      });
      await this.model.findOneAndUpdate(
        { userId: user._id },
        {
          $set: { refreshToken: tokens.refreshToken },
        },
        { new: true }
      );

      this.logger.info(`User logged in: ${user._id}`);
      res.status(200).json({
        message: 'User logged in successfully',
        ...tokens,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  async me(req: Request, res: Response) {
    try {
      const userId = req.meta.user?.userId;
      if (!userId) {
        res.status(401).json({ message: 'Access token is missing' });
        return;
      }
      const user = await userModel.findById(userId).select('-password');
      if (!user) {
        // Not ERRORS.USER_NOT_FOUND — that message is specific to a failed
        // email lookup on login. This is a valid token whose account no
        // longer exists (e.g. deleted after the token was issued).
        res.status(404).json({
          message: 'The account associated with this session no longer exists',
        });
        return;
      }
      res.status(200).json({ user });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(401).send({
          message: 'Refresh token is required',
        });
        return;
      }

      const decoded = this.jwt.verifyRefreshToken(refreshToken) as {
        _id: string;
      };

      if (!decoded) {
        res.status(401).send({
          message: 'Invalid or expired refresh token',
        });
        return;
      }

      const { _id, roles } = decoded as jwt.JwtPayload;

      // Beyond the signature/expiry check above, the token must still
      // match what's on file for this user — logging out (or logging in
      // elsewhere, which rotates it) clears/overwrites this record, so an
      // old refresh token stops working immediately instead of staying
      // valid for its full remaining lifetime.
      const authRecord = await this.model.findOne({
        userId: _id,
        refreshToken,
      });
      if (!authRecord) {
        res.status(401).send({
          message: 'Refresh token has been revoked, please log in again',
        });
        return;
      }

      const accessToken = this.jwt.createAccessToken({ _id, roles });

      res.status(200).send({
        accessToken,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Any authenticated role. Clears the persisted refresh token so
  // /auth/refresh (see above) rejects it immediately — the caller's
  // current access token still works until it naturally expires (there's
  // no access-token revocation/blacklist in this codebase), but no new one
  // can be minted without logging in again.
  async logout(req: Request, res: Response) {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      await this.model.updateOne(
        { userId: user.userId },
        { $set: { refreshToken: '' } }
      );

      this.logger.info(`User logged out: ${user.userId}`);
      res.status(200).send({ message: 'Logged out successfully' });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Any authenticated role. A caller who only holds RETAILER is removed
  // immediately. A caller who holds SUPPLIER (whether or not they also
  // hold RETAILER) can't self-delete outright — a SUPPLIER may have open
  // pools/payouts an admin needs to account for — so this instead opens a
  // SupplierRemoveRequest for admin review; the account is only actually
  // deleted once that request is APPROVED (see
  // supplier.remove.requests.controller.ts).
  async remove(req: Request, res: Response) {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const { reason } = req.body;

      if (user.roles.includes('SUPPLIER')) {
        const existing = await supplierRemoveRequestModel.findOne({
          user_ref: user.userId,
          status: 'PENDING',
        });
        if (existing) {
          res.status(409).send({ message: this.ERRORS.CONFLICT });
          return;
        }

        const doc = new supplierRemoveRequestModel({
          user_ref: user.userId,
          reason,
        });
        const saved = await doc.save();

        this.logger.info(
          `SupplierRemoveRequest created for user: ${user.userId}`
        );
        res.status(201).send({
          message:
            'Your account removal request has been submitted for admin approval',
          data: saved,
        });
        return;
      }

      await userModel.deleteOne({ _id: user.userId });
      await this.model.deleteOne({ userId: user.userId });

      this.logger.info(`User removed: ${user.userId}, reason: ${reason}`);
      res.status(200).send({ message: 'Account removed successfully' });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  verify(req: Request, res: Response) {
    try {
      const { token } = req.params as { token: string };
      const decoded = this.jwt.verifyAccessToken(token) as jwt.JwtPayload;
      this.logger.info(`Token verified for user: ${decoded.email}`);
      res.send('VERIFY EMAIL FOR USER' + decoded.email);
      // update isVerified in field in user model
      // res.redirect()
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }
}

const authController = new AuthController();

export default authController;
