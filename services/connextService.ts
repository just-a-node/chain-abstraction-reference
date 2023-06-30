import {
  getPoolFeeForUniV3,
  getXCallCallData,
  prepareSwapAndXCall,
  getSupportedAssetsForDomain,
  getPriceImpactForSwaps,
  getEstimateAmountReceived,
} from "@connext/chain-abstraction";
import {
  DestinationCallDataParams,
  Swapper,
  SwapAndXCallParams,
} from "@connext/chain-abstraction/dist/types";
import { SdkConfig, create } from "@connext/sdk";
import { BigNumber } from "ethers";

import ContractService from "./walletService";
import WalletService from "./contractService";

interface DomainID {
  [key: number]: string;
}

interface ChainID {
  [key: string]: number;
}

export const DEPLOYED_ADDRESSES: Record<string, Record<string, string>> = {
  swapandxcall: {
    "6648936": "", // ETH mainnet
    "1869640809": "", // Optimism
    "6450786": "0x119dd93154780d7604D50014c4545b4906928bFF", // BNB Chain
    "6778479": "", // Gnosis Chain
    "1886350457": "0x6e92344d08F8443a9C704452ac66bEFB90D32E12", // Polygon
    "1634886255": "0xa28DE94d2e6F84659c2C32dF14334Daa08DD6461", // Arbitrum One
    "2053862243": "", // zkSync2 mainnet
    "1887071085": "", // Polygon zkEVM
  },
};

export default class ConnextService {
  contractService: ContractService;
  walletService: WalletService;
  sdkConfig: SdkConfig;

  constructor(
    contractService: ContractService,
    walletService: WalletService,
    sdkConfig: SdkConfig
  ) {
    this.contractService = contractService;
    this.walletService = walletService;
    this.sdkConfig = sdkConfig;
  }

  // getRPCURL(chainID: number) {
  //   const network = find(NETWORKS, { chainId: chainID });
  //   if (network) {
  //     return network.rpc[0];
  //   }
  //   throw Error('Network not supported');
  // }

  async estimateRelayerFee(originDomain: string, destinationDomain: string) {
    const { sdkBase } = await create(this.sdkConfig);
    console.log("In the function");
    const relayerFees = await sdkBase.estimateRelayerFee({
      originDomain,
      destinationDomain,
    });

    return relayerFees.toString();
  }

  async getPoolFeeForUniV3(
    domainID: string,
    token0: string,
    token1: string,
    rpcUrl: string
  ) {
    try {
      const poolFee = await getPoolFeeForUniV3(
        domainID,
        rpcUrl,
        token0,
        token1
      );
      return poolFee;
    } catch (err) {
      throw Error("Failed to fetch Pool Fees");
    }
  }

  async getXCallCallDataHelper(
    domainID: string,
    forwardCallData: string,
    params: DestinationCallDataParams
  ) {
    const swapper = Swapper.UniV3;
    return getXCallCallData(domainID, swapper, forwardCallData, params);
  }

  async prepareSwapAndXCallHelper(
    swapAndXCallParams: SwapAndXCallParams,
    signerAddress: string
  ) {
    return prepareSwapAndXCall(swapAndXCallParams, signerAddress);
  }

  async getSupportedAssetsForDomain(chainId: number) {
    return getSupportedAssetsForDomain(chainId);
  }

  async getSupportedChainsByConnext() {
    const { sdkBase } = await create(this.sdkConfig);
    return sdkBase.getSupported();
  }

  async getEstimateAmountReceived(
    chainFrom: number,
    chainTo: number,
    originToken: string,
    amount: BigNumber
  ) {
    const supported = await this.getSupportedChainsByConnext();

    const originDomain = supported[chainFrom].domainId;
    const destinationDomain = supported[chainTo].domainId;

    const { sdkBase } = await create(this.sdkConfig);
    const estimateReceived = await sdkBase.calculateAmountReceived(
      originDomain,
      destinationDomain,
      originToken,
      amount
    );
    return estimateReceived;
  }

  getNativeUSDCAddress(networkName: number) {
    const USDC_ADDRESS: DomainID = {
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      137: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      10: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
      42161: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      100: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
      56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    };
    return USDC_ADDRESS[networkName];
  }

  domainToChainID(domain: string) {
    const domainToChain: ChainID = {
      "1869640809": 10,
      "1886350457": 137,
      "1634886255": 42161,
      "6450786": 56,
    };
    return domainToChain[domain];
  }

  // async getTransferStatus(transactionHash: string) {
  //   try {
  //     const { sdkUtils } = await create(this.sdkConfig);
  //     const params: { transactionHash: string } = {
  //       transactionHash,
  //     };
  //     const transferStatus = (await sdkUtils.getTransfers(params)) as ConnextTransferStatusResponse;
  //     if (!transferStatus) {
  //       throw Error('Failed to fetch transfer status');
  //     }
  //     return transferStatus;
  //   } catch (err) {
  //     throw Error(err);
  //   }
  // }

  // getAllowanceTarget(token: Token): string {
  //   return DEPLOYED_ADDRESSES.swapandxcall[SUPPORTED_CHAINS_BY_CONNEXT[token.chainId].domainId];
  // }
}
