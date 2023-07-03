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
import { BigNumberish, ethers, utils, BigNumber } from "ethers";
import { domainsToChainNames } from "@connext/sdk/dist/config";
import { SendTransactionParameters, parseGwei } from "viem";
import TokenList from "../components/tokenList";

interface HomePageProps {
  walletClient: any;
}

const ARBITRUM_PROTOCOL_TOKEN_ADDRESS =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const POLYGON_WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
const POLYGON_ADAPTER_CONTRACT = "0xC29e6E326a5652d478d51c271cB110Fa32e97f1F";

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

  const [relayerFee, setRelayerFee] = useState<string | undefined>(undefined);
  const [quotedAmountOut, setQuotedAmountOut] = useState<string | null>(null);
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

  const [greeting, setGreeting] = useState<string>("");

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
                providers: ["https://arbitrum.meowrpc.com"],
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
    console.log("selected token:", token);
    setSelectedToken(token);
  };

  const handleGreet = (
    originDomain: string,
    destinationDomain: string,
    originTransactingAsset: string,
    destinationDesiredAsset: string,
    originRpc: string,
    destinationRpc: string,
    amountIn: BigNumberish
  ) => {
    (async () => {
      if (connextService) {
        try {
          // Use the RPC url for the origin chain

          let signer = new ethers.Wallet("PRIVATE_KEY");
          const provider = new ethers.providers.JsonRpcProvider(
            "https://arbitrum.meowrpc.com"
          );
          signer = signer.connect(provider);

          const signerAddress = await signer.getAddress();

          const originChain = connextService.domainToChainID(originDomain);
          const destinationChain =
            connextService.domainToChainID(destinationDomain);

          const originUSDC = connextService.getNativeUSDCAddress(originChain);
          console.log(
            `originDomain: ${originDomain}, originUSDC: ${originUSDC}`
          );
          const destinationUSDC =
            connextService.getNativeUSDCAddress(destinationChain);
          console.log(
            `destinationDomain: ${destinationDomain}, destinationUSDC: ${destinationUSDC}`
          );

          const fee = await connextService.estimateRelayerFee(
            originDomain,
            destinationDomain
          );
          setRelayerFee(fee);

          console.log(`fee: ${fee}`); // alwys going to be undefined due to state management

          // Destination side

          const quoteAmount =
            await connextService.getEstimateAmountReceivedHelper({
              originDomain: +originDomain,
              destinationDomain: +destinationDomain,
              amountIn: "1000000",
              originRpc,
              destinationRpc,
              fromAsset: originTransactingAsset,
              toAsset: destinationDesiredAsset,
              signerAddress,
              originDecimals: 6,
              destinationDecimals: 18,
            });

          setQuotedAmountOut(quoteAmount as string);

          console.log(`quoteAmount: ${quoteAmount}`);
          console.log(
            `destinationDomain: ${destinationDomain}, destinationUSDC: ${destinationUSDC}, originTransactingAsset: ${originTransactingAsset}, destinationDesiredAsset: ${destinationDesiredAsset}, destinationRpc: ${destinationRpc}`
          );

          const poolFee = await connextService.getPoolFeeForUniV3(
            destinationDomain,
            destinationUSDC, // destination USDC
            destinationDesiredAsset, // destination Token
            destinationRpc
          );

          console.log(`poolFee: ${poolFee}`);

          const params: DestinationCallDataParams = {
            fallback: signerAddress,
            swapForwarderData: {
              toAsset: destinationDesiredAsset,
              swapData: {
                amountOutMin: "0",
                poolFee,
              },
            },
          };
          console.log("hey before forwarder");
          const forwardCallData = utils.defaultAbiCoder.encode(
            ["address", "string"],
            [POLYGON_WETH, greeting]
          );
          console.log("bye ");
          const xCallData = await connextService.getXCallCallDataHelper(
            destinationDomain,
            forwardCallData,
            params
          );
          console.log(
            originTransactingAsset,
            ARBITRUM_PROTOCOL_TOKEN_ADDRESS,
            "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            "token address verifying "
          );
          const swapAndXCallParams: SwapAndXCallParams = {
            originDomain,
            destinationDomain,
            fromAsset: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            // originTransactingAsset === ARBITRUM_PROTOCOL_TOKEN_ADDRESS
            //   ? ethers.constants.AddressZero
            //   : originTransactingAsset,
            toAsset: originUSDC,
            amountIn: "1000000",
            to: POLYGON_ADAPTER_CONTRACT,
            relayerFeeInNativeAsset: relayerFee,
            callData: xCallData,
          };

          const txRequest = await connextService.prepareSwapAndXCallHelper(
            swapAndXCallParams,
            signerAddress
          );

          console.log(txRequest, "txRequest");

          if (txRequest) {
            txRequest.gasLimit = BigNumber.from("20000000000");
            const xcallTxReceipt = await signer.sendTransaction(txRequest);
            console.log(xcallTxReceipt);
            await xcallTxReceipt.wait();
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

  console.log(`amountIn:`, amountIn);

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
            {ChainMapping.map((chainMap, index) => (
              <a key={index} onClick={() => setChainID(chainMap.chainId)}>
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
          <div style={{ marginLeft: "10px" }}>
            <input
              className={styles.inputGreeting}
              onChange={(e) => {
                setGreeting(e.target.value);
              }}
              placeholder="Greeting"
            />
          </div>
        </div>

        {relayerFee && (
          <div>
            <p>
              Relayer Fees: {ethers.utils.formatEther(relayerFee).toString()}{" "}
              ETH
            </p>
          </div>
        )}

        {quotedAmountOut && (
          <div>
            <p>
              {" "}
              Estimated Amount out:{" "}
              {ethers.utils.formatUnits(quotedAmountOut, 18).toString()} WETH
            </p>
          </div>
        )}

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
                  "https://arbitrum.meowrpc.com",
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
