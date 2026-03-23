<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# Turfsy-Server

## Authentication API

Base URL: `https://turfsy.onrender.com`

### 1. POST /api/v3/auth/login

**Request:**
```json
{
  "phone": "8652601566"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "sessionToken": "uuid",
  "expiresIn": 60
}
```

### 2. POST /api/v3/auth/verify-otp

**Request:**
```json
{
  "phone": "8652601566",
  "otp": "OTP_FROM_TERMINAL"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OTP verified",
  "accessToken": "eyJhbGci..." // JWT token, use this for authenticated requests
}
```

### 3. POST /api/v3/auth/select-role

**Headers:**
`Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY`

**Request:**
```json
{
  "role": "USER"
}
```
**Response:**
```json
{
  "role": "USER",
  "isNewUser": true,
  "profile": null,
  "accessToken": "eyJhbGci..." // JWT token (if you want to re-issue or confirm)
}
```

### 4. POST /api/v3/auth/resend-otp

**Request:**
```json
{
  "sessionToken": "SESSION_TOKEN_FROM_LOGIN"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "expiresIn": 60
}
```

### 5. GET /api/v3/auth/get-me

**Headers:**
`Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone": "8652601566",
    "role": "USER",
    "isVerified": true,
    "isActive": true,
    "profile": {
      "id": "uuid",
      "name": "",
      "email": ""
    },
    "payment": null
  }
}
```

### 6. GET /api/v3/auth/logout

**Headers:**
`Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 7. DELETE /api/v3/auth/delete-account

**Headers:**
`Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY`

**Request:**
```json
{
  "sessionToken": "SESSION_TOKEN_FROM_LOGIN"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

### Test Order

1. POST /login         → copy sessionToken + check terminal for OTP
2. POST /verify-otp    → copy accessToken
3. POST /select-role   → use accessToken, select role, get isNewUser/profile
4. GET  /get-me        → use accessToken
5. POST /resend-otp    → use sessionToken
6. GET  /logout        → use accessToken
7. DELETE /delete-account → use both
