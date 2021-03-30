# Gelato Krystal - Dollar Cost Averaging - Monorepo
Monorepo containing:

- React App
- Hardhat package with SC tests & deployment files
- Contracts package containing addresses and ABIs

## Watch a quick video walkthrough of the UI
<a href="https://drive.google.com/file/d/162iUBphXUBZ2oBTIxDF5PTGxj52KBLNZ/view?usp=sharing" target="_blank">
<img src="./dca.png"
     alt="DCA Image"
     style="width: 640px;" 
/>


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

## Run the React App (MAINNET)

```
yarn react-app:start
```

## Run the Hardhat test suite

```
yarn hardhat:run-test
```