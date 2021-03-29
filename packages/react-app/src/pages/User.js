import React, { useState, useEffect } from "react";
import { CardWrapper } from "../components";
import InputCard from "../components/InputCard";
import ViewCardWrapper from "../components/ViewCardWrapper";
import ViewCardButton from "../components/ViewCardButton";
import { getMiniUserAddress, getTokenBalance } from "../services/stateReads";
import { getFormattedNumber } from "../utils/helpers";
import { addresses } from "@gelato-krystal/contracts";

const { DAI, WETH } = addresses;

const User = ({ userAccount }) => {
  const [inputs, setInputs] = useState({});
  const [refresh, setRefresh] = useState(false);

  const inputsUpdates = async () => {
    const miniUserAddress = await updateUserAddress();
    const userDaiBalance = await getFormattedNumber(
      await getTokenBalance(userAccount, DAI)
    );
    const userUsdcBalance = await getFormattedNumber(
      await getTokenBalance(userAccount, WETH)
    );

    setInputs({
      ...inputs,
      userAddress: miniUserAddress,
      userDaiBalance: userDaiBalance,
      userUsdcBalance: userUsdcBalance,
    });
  };

  const updateUserAddress = async () => {
    return await getMiniUserAddress(userAccount);
  };

  useEffect(() => {
    inputsUpdates();
  }, [refresh]);

  return (
    <>
      <CardWrapper>
        <ViewCardWrapper
          title="User Address"
          state={inputs.userAddress}
        ></ViewCardWrapper>
      </CardWrapper>
      <CardWrapper>
        <ViewCardWrapper
          title="DAI Balance"
          state={inputs.userDaiBalance}
        ></ViewCardWrapper>
        <ViewCardWrapper
          title="WETH Balance"
          state={inputs.userUsdcBalance}
        ></ViewCardWrapper>
      </CardWrapper>
    </>
  );
};

export default User;
