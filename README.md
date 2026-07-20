# Order Pool Backend

lets many buyers pool their orders together to buy goods in bulk. This acts like a wholesale buying club. The larger order size unlocks big discounts. This lowers costs for everyone

## Tech Stack

- node.js / express
- mongo / mongoose
- redis
  <!-- - bullmq -->
  <!-- - event emitter ( mqtt / EventEmitter ) -->
- docker

## Features

- Authentication / Authorization
- Order Pooling
- Logistics Tracking
- Notifications
- Payment Integration

## Roles

- Admin - ( me as the owner of the platform )
- Suppliers - ( the one who provides goods )
- Retailers - ( the one who buys goods in bulk )

## installation

```
.env ( get .env file from owner )
git clone <project-url>
cd <project-folder>
copy .env.example to .env and fill in the required values
npm install
```

### run project in dev

```
docker-compose up -d mongo mongo-express redis
npm run dev
```

### test prod built

```
npm run build
npm run start
```

### run project in prod

```
docker compose up -d
```

### run tests

```
npm run test
```

<!-- ### FOLDER STRUCTURE[./docs/folder-structure.md](./docs/folder-structure.md) -->
