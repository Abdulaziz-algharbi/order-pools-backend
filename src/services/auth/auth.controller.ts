import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import BaseController from '../base/base.controller';
import AuthModel from './auth.model';

class AuthController extends BaseController {
  constructor() {
    super(AuthModel, []);
  }

  async register(req: Request, res: Response) {
    try {
      // const { firstName, lastName, email, phoneNumber, companyName, password } = req.body;
      const userModel = this.registry.get(this.REGISTRY.USER_MODEL);
      const existing = await userModel.findOne({ email: req.body.email });
      if (existing) throw new Error(this.ERRORS.CONFLICT);
      const user = new userModel({
        ...req.body,
      });
      const savedUser = await user.save();
      const tokens = this.jwt.createTokens({
        _id: savedUser._id,
        role: savedUser.role,
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
      const userModel = this.registry.get(this.REGISTRY.USER_MODEL);
      const user = await userModel.findOne({ email });
      if (!user) throw new Error(this.ERRORS.USER_NOT_FOUND);

      if (!this.hasher.compareSync(password, user.password))
        throw new Error(this.ERRORS.INVALID_CREDENTIALS);
      const tokens = this.jwt.createTokens({ _id: user._id, role: user.role });
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
    const userId = req.meta.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const userModel = this.registry.get(this.REGISTRY.USER_MODEL);
    const user = await userModel.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
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

      const { _id, role } = decoded as jwt.JwtPayload;

      const accessToken = this.jwt.createAccessToken({ _id, role });

      res.status(200).send({
        accessToken,
      });
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error}`);

      res.status(500).send({
        message: 'Internal server error',
      });
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
