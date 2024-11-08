# Account Abstraction (AA) service

All-in-one off-chain services for AA on DERA chain, included but not limited to Bundler, Paymaster service that comply with EIP-4337.
This repository is based on [Biconomy open-source bundler service](https://github.com/bcnmy/bundler) that extends other modules such as Paymaster.

## Prerequisites

- [NodeJS v20 LTS](https://nodejs.org/en/blog/release/v20.9.0).
- [Docker v27](https://docs.docker.com/engine/release-notes/27/) with [docker-compose](https://docs.docker.com/compose/install/linux/) plugins installed.

## Setup

- Install `yarn` and `ts-node`
```sh
$ npm install -g yarn
$ npm install -g ts-node
```

- Install dependencies
```sh
$ yarn
```

- Create `.env` file from template and populate necessary secrets and credentials
```sh
$ cp .env-example .env
```

- Create `./src/config/config.json` from `./src/config/config.template.json` and populate necessary secrets and credentials
```sh
$ cp ./src/config/config.template.json ./src/config/config.json
```

- Compile `config.json` after exporting the `BUNDLER_CONFIG_PASSPHRASE` environment variable with the same value that is predefined in the `.env` file from the previous step
```sh
$ export BUNDLER_CONFIG_PASSPHRASE="<same-value-within-dotenv-file>"
$ cd src && npx ts-node encrypt-config.ts
```
you should note that `completed` text is printed out upon compilation.

## Run

- Start server and run in foreground
```sh
$ docker-compose up
```
the server should be up and running at `localhost:3000` without errors.

- Start server background
```sh
$ docker-compose up -d
```

## Unit test

- Compile test
```sh
$ npx tsc
```

- Execute UTs
```sh
$ npm run test
```

## Dry test

- Test Bundler endpoint
```sh
$ curl -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1693369916,"method":"eth_supportedEntryPoints","params":[]}' http://localhost:3000/api/v2/20240801/x
```
the server should return successful response, such as:
```json
{"jsonrpc":"2.0","id":1693369916,"result":["0xd085d4bf2f695D68Ba79708C646926B01262D53f"]}
```

- Test Paymaster endpoint
```sh
$ curl -X POST -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1693369916,"method":"eth_chainId","params":[]}' http://localhost:3000/paymaster/api/v1/20240801/x
```
the server should return successful response, such as:
```json
{"id":1693369916,"jsonrpc":"2.0","result":"0x134d9a1"}
```

## Integration test

- Refer to [Demo AA client](https://github.com/DERACHAIN/Demo-AA-client) for details.

## Clean

- Stop server
```sh
$ docker-compose down -v
```

## Other useful commands

- Build new docker image upon adding new package to `package.json`
```sh
$ docker-compose build server
```
or without cache in the case you suspect caching problems
```sh
$ docker-compose build --no-cache <service-name>
```
