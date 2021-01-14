# Gelato Krystal - Dollar Cost Averaging - Monorepo
Monorepo containing:

- React App
- Hardhat package with SC tests & deployment files
- Contracts package containing addresses and ABIs

## Setup

Run
```
yarn
```

Add alchemy id in packages/hardhat/.env
```
ALCHEMY_ID=""
```

## Run the React App (ROPSTEN ONLY)

```
yarn react-app:start
```

## Run the Hardhat test suite

```
yarn hardhat:run-test
```