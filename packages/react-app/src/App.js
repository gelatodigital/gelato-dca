/* eslint-disable */
import { Web3Provider } from "@ethersproject/providers";
import React, { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Link,
  Redirect,
  Route,
  Switch,
} from "react-router-dom";
import { Body, Button, CardWrapper, Header, Page } from "./components";
import GelatoLogo from "./components/Logo";
import SubmitTask from "./pages/SubmitTask";
import TaskOverview from "./pages/TaskOverview";
import User from "./pages/User";
import { logoutOfWeb3Modal, web3Modal } from "./utils/web3Modal";

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
      {!userAccount ? "Connect Wallet" : "Disconnect Wallet"}
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
              <Page>
                <Link
                  style={{
                    color: "#483D8B",
                    textDecoration: "none",
                    fontWeight: "bold",
                  }}
                  to="/"
                >
                  User
                </Link>
              </Page>
              <Page>
                <Link
                  style={{
                    color: "#483D8B",
                    textDecoration: "none",
                    fontWeight: "bold",
                  }}
                  to="/submit-task"
                >
                  Submit Task
                </Link>
              </Page>
              <Page>
                <Link
                  style={{
                    color: "#483D8B",
                    textDecoration: "none",
                    fontWeight: "bold",
                  }}
                  to="/task-overview"
                >
                  Task Overview
                </Link>
              </Page>
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
                  <h3 style={{ color: "#4299e1" }}>Please login</h3>
                </CardWrapper>
              </Route>
            )}
            {userAccount && (
              <>
                <Route path="/submit-task">
                  {userAccount && userAddress && (
                    <SubmitTask
                      userAccount={userAccount}
                      userAddress={userAddress}
                    ></SubmitTask>
                  )}
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
