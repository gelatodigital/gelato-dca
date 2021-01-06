/* eslint-disable */
import React, { useCallback, useEffect, useState } from 'react';
import { Web3Provider } from '@ethersproject/providers';
import User from './pages/User';
import SubmitTask from './pages/SubmitTask';
import TaskOverview from './pages/TaskOverview';
import GelatoLogo from './components/Logo';

import { Body, Button, Header, HyperLink, CardWrapper } from './components';

import { web3Modal, logoutOfWeb3Modal } from './utils/web3Modal';

import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link,
  Redirect,
} from 'react-router-dom';

function WalletButton({ userAccount, loadWeb3Modal }) {
  return (
    <Button
      onClick={() => {
        if (!userAccount) {
          loadWeb3Modal();
        } else {
          logoutOfWeb3Modal();
        }
      }}
    >
      {!userAccount ? 'Connect Wallet' : 'Disconnect Wallet'}
    </Button>
  );
}

function App() {
  const [userAccount, setUserAccount] = useState();
  const [userAddress, setUserAddress] = useState();

  /* Open wallet selection modal. */
  const loadWeb3Modal = useCallback(async () => {
    const newuserAccount = await web3Modal.connect();
    //console.log((new ethers.providers.Web3Provider(newuserAccount)).getSigner());
    setUserAccount(new Web3Provider(newuserAccount));
  }, []);

  /* If user has loaded a wallet before, load it automatically. */
  useEffect(() => {
    if (web3Modal.cacheduserAccount) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  const updateUserAddress = async () => {
    const signer = await userAccount.getSigner();
    const newUserAddress = await signer.getAddress();
    if (userAddress !== newUserAddress) setUserAddress(newUserAddress);
  };

  useEffect(() => {
    if (userAccount) updateUserAddress();
  });

  return (
    <div>
      <Router>
        <Header>
          <div className="gelato-logo">
            <GelatoLogo></GelatoLogo>
          </div>
          {userAccount && userAddress && (
            <>
              <HyperLink>
                <Link
                  style={{
                    color: '#483D8B',
                    textDecoration: 'none',
                    'font-weight': 'bold',
                  }}
                  to="/"
                >
                  User
                </Link>
              </HyperLink>
              <HyperLink>
                <Link
                  style={{
                    color: '#483D8B',
                    textDecoration: 'none',
                    'font-weight': 'bold',
                  }}
                  to="/submit-task"
                >
                  Submit Task
                </Link>
              </HyperLink>
              <HyperLink>
                <Link
                  style={{
                    color: '#483D8B',
                    textDecoration: 'none',
                    'font-weight': 'bold',
                  }}
                  to="/task-overview"
                >
                  Task Overview
                </Link>
              </HyperLink>
            </>
          )}
          <WalletButton
            userAccount={userAccount}
            loadWeb3Modal={loadWeb3Modal}
          />
        </Header>
        <Body>
          <Switch>
            {!userAccount && (
              <Route path="/">
                <CardWrapper>
                  <h3 style={{ color: '#4299e1' }}>Please login</h3>
                </CardWrapper>
              </Route>
            )}
            {userAccount && (
              <>
                <Route path="/submit-task">
                  <SubmitTask userAccount={userAccount}></SubmitTask>
                </Route>
                <Route path="/task-overview">
                  {userAccount && userAddress && (
                    <TaskOverview
                      userAccount={userAccount}
                      userAddress={userAddress}
                    ></TaskOverview>
                  )}
                </Route>
                <Route exact path="/">
                  <User userAccount={userAccount}></User>
                </Route>

                {/*Redirect all 404's to home*/}
                <Redirect to="/" />
              </>
            )}
          </Switch>
        </Body>
      </Router>
    </div>
  );
}

export default App;
