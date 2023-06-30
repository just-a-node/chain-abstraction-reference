import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEffect, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import styles from '../styles/Home.module.css';
import ContractService from '../services/contractService';
import WalletService from '../services/walletService';
import ConnextService from '../services/connextService';
import { useEthersProvider, useEthersSigner } from '../ethers/ethersAdapters'
import { SdkConfig } from "@connext/sdk";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import {
  DestinationCallDataParams,
  SwapAndXCallParams,
  Asset,
} from "@connext/chain-abstraction/dist/types";
import { BigNumberish, ethers } from "ethers";
import { domainsToChainNames } from "@connext/sdk/dist/config";
import { SendTransactionParameters } from "viem";
import TokenList from "../components/tokenList";

interface HomePageProps {
  walletClient: any;
}

const ChainMapping = [
  {
    chainId: 137,
    name: "POLYGON",
  },
  { chainId: 10, name: "OPTIMSIM" },
  { chainId: 56, name: "BINANCE" },
  { chainId: 42161, name: "ARBITRUM" },
];

const HomePage: NextPage = (pageProps) => {
  const { address } = useAccount();
  const { data } = useWalletClient();
  const publicClient = usePublicClient();

  const [relayerFee, setRelayerFee] = useState<string | undefined>(undefined);

  const [contractService, setContractService] = useState<
    ContractService | undefined
  >(undefined);
  const [walletService, setWalletService] = useState<WalletService | undefined>(
    undefined
  );
  const [connextService, setConnextService] = useState<
    ConnextService | undefined
  >(undefined);
  const [signerAddress, setSignerAddress] = useState<string | undefined>(
    undefined
  );

  const [chainId, setChainID] = useState<number>(0);

  const [selectedToken, setSelectedToken] = useState<Asset | null>(null);

  const [amountIn, setAmountIn] = useState<BigNumberish>("0");

  const provider = useEthersProvider();
  const signer = useEthersSigner();

  useEffect(() => {
    const initServices = async () => {
      if (signer && provider) {
        const chain = (await provider.getNetwork()).chainId;
        setChainID(chain);
        const signerAddress = await signer.getAddress();
        setSignerAddress(signerAddress);

        const contractService = new ContractService(provider);
        setContractService(contractService);

        const walletService = new WalletService(
          contractService,
          provider,
          signer
        );
        setWalletService(walletService);

        if (signerAddress) {
          const sdkConfig: SdkConfig = {
            signerAddress,
            network: "mainnet" as const,
            chains: {
              1869640809: {
                providers: ["https://rpc.ankr.com/optimism"],
              },
              1886350457: {
                providers: ["https://polygon.llamarpc.com"],
              },
              1634886255: {
                providers: ["https://arb-mainnet-public.unifra.io"],
              },
              6450786: {
                providers: ["https://bsc.rpc.blxrbdn.com"],
              },
              // TODO: get chains
            },
          };
          const connextServiceInstance = new ConnextService(
            walletService,
            contractService,
            sdkConfig
          );
          setConnextService(connextServiceInstance);
        }
      }
    };

    initServices();
  }, [signer, provider]);

  const handleSelectedToken = (token: Asset) => {
    console.log(token);
    setSelectedToken(token);
  };
  const POLYGON_WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

  const handleGreet = (
    originDomain: string,
    destinationDomain: string,
    token0: string,
    token1: string,
    originRpc: string,
    destinationRpc: string,
    amountIn: BigNumberish
  ) => {
    (async () => {
      if (connextService) {
        try {
          const originChain = connextService.domainToChainID(originDomain);
          const destinationChain =
            connextService.domainToChainID(destinationDomain);

          const originUSDC = connextService.getNativeUSDCAddress(originChain);
          console.log(originDomain, originUSDC);
          const destinationUSDC =
            connextService.getNativeUSDCAddress(destinationChain);
          console.log(destinationDomain, destinationUSDC);

          const fee = await connextService.estimateRelayerFee(
            originDomain,
            destinationDomain
          );
          // setRelayerFee(fee);
          console.log(fee); // alwys going to be undefined due to state management
          console.log({
            destinationDomain,
            destinationUSDC, // destination USDC
            token1, // destination Token
            destinationRpc,
          });
          // getting uniswap pool fees here.
          const poolFee = await connextService.getPoolFeeForUniV3(
            destinationDomain,
            destinationUSDC, // destination USDC
            token1, // destination Token
            destinationRpc
          );

          console.log(poolFee, "poolFee");

          // Destination CallData params

          const params: DestinationCallDataParams = {
            fallback: address as string,
            swapForwarderData: {
              toAsset: token1,
              swapData: {
                amountOutMin: "0",
                poolFee,
              },
            },
          };

          const forwardCallData: string = "0x";

          const xCallData = await connextService.getXCallCallDataHelper(
            destinationDomain,
            forwardCallData,
            params
          );

          const PROTOCOL_TOKEN_ADDRESS =
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

          const swapAndXCallParams: SwapAndXCallParams = {
            originDomain,
            destinationDomain,
            fromAsset:
              token0 === PROTOCOL_TOKEN_ADDRESS
                ? ethers.constants.AddressZero
                : token0, // BNB
            toAsset: originUSDC, // originUSDC
            amountIn: amountIn.toString(),
            to: "0x8509F7B732554BA0126Cab838279dcC865CB4aC5",
            relayerFeeInNativeAsset: relayerFee, // 0.001 BNB
            callData: xCallData,
          };

          const txRequest = await connextService.prepareSwapAndXCallHelper(
            swapAndXCallParams,
            address as string
          );

          if (txRequest && data) {
            data.sendTransaction(txRequest as SendTransactionParameters);
          }
        } catch (error) {
          console.error("Failed to fetch relayer fee", error);
        }
      } else {
        console.log("Connext service not initialized");
      }
    })();
  };

  let selectedNetwork = "Choose a network";
  ChainMapping.forEach((chainMap) => {
    if (chainMap.chainId === chainId) {
      selectedNetwork = chainMap.name;
    }
  });

  console.log(amountIn);

  return (
    <div className={styles.container}>
      <Head>
        <title>Connext Next JS</title>
        <meta content="Generated by @connext/sdk" name="description" />
        <link href="/favicon.ico" rel="icon" />
      </Head>
      <main className={styles.main}>
        <div className={styles.flexDisplay}>
          <h2>Connext Chain Abstraction Reference</h2>
          <ConnectButton />
        </div>
        <div className={styles.dropdown}>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              border: "1px solid #0d76fc",
              margin: "0",
              padding: "0",
              borderRadius: "5px",
              paddingLeft: "10px",
            }}
          >
            <h3 style={{ margin: "0", padding: "0" }}>{selectedNetwork}</h3>
            <button className={styles.dropbtn}>Select Chain</button>
          </div>

          <div className={styles.dropdownContent}>
            {ChainMapping.map((chainMap) => (
              <a onClick={() => setChainID(chainMap.chainId)}>
                {chainMap.name}
              </a>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "500px",
            marginTop: "100px",
            // justifyContent: "space-around",
            // alignItems: "center",
          }}
        >
          <TokenList
            chainId={chainId}
            setSelectedToken={handleSelectedToken}
            selectedToken={selectedToken}
          />

          <div style={{ marginLeft: "10px" }}>
            <input
              className={styles.inputAmount}
              onChange={(e) => {
                setAmountIn(e.target.value);
              }}
              placeholder="Amount"
            />
          </div>
        </div>
        {/* <TokenList chainId={chainId} /> */}
        <div className={styles.center}>
          {selectedToken ? (
            <button
              className={styles.button}
              onClick={() =>
                handleGreet(
                  "1634886255",
                  "1886350457",
                  selectedToken.address,
                  POLYGON_WETH,
                  "https://arb-mainnet-public.unifra.io",
                  "https://polygon.llamarpc.com",
                  amountIn
                )
              }
            >
              Greet With Tokens
            </button>
          ) : (
            <p>No token selected</p>
          )}

          {/* {tracker && (
            <p>
              You can track you xcall{" "}
              <a target="_blank" href={tracker} rel="noreferrer">
                here.
              </a>
            </p>
          )} */}
        </div>
        <div></div>
      </main>
      <footer className={styles.footer}>
        For more information refer to the official Connext documentation{" "}
        <a
          href="https://docs.connext.network/"
          target="_blank"
          rel="noreferrer"
        >
          here
        </a>
        .
      </footer>
    </div>
  );
};

export default HomePage;
