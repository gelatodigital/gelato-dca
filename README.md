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

**Add alchemy id in packages/hardhat/.env**
```
ALCHEMY_ID=""
```

**Add Blocknative notify.js key in packages/react-app/.env**
```
REACT_APP_BLOCK_NATIVE=""
```

## Run the React App (ROPSTEN ONLY)

```
yarn react-app:start
```

## Run the Hardhat test suite

```
yarn hardhat:run-test
```