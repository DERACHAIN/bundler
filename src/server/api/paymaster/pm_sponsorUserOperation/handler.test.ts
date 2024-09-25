/* eslint-disable import/first */
import httpMocks, { RequestOptions } from "node-mocks-http";
import { EVMNetworkService } from "../../../../common/network";

const entryPointAddress = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";
const entryPointContract = {
  address: entryPointAddress,
};
const chainId = "1";
const requestId = "123";
const bundlerApiKey = "test-api-key";

// These mock functions are used in tests to control what is returned by other services the endpoint depends on
const estimateUserOperationGasMock = jest.fn();
const getGasPriceMock = jest.fn();
const paymasterContractMock = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getHash: jest.fn().mockImplementation((userOp: any, verifier: string, validUntil: number, validAfter: number) => "0x41b1a0649752af1b28b3dc29a1556eee781e4a4c3a1f7f53f90fa834de098c4d"),
  address: "0x1234567890123456789012345678901234567890",
};

jest.mock("ethers", () => ({
  ethers: {
    providers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
      })),
    },
    Wallet: jest.fn().mockImplementation(() => ({
      address: "0x1234567890123456789012345678901234567890",
      getAddress: jest.fn().mockResolvedValue(Promise.resolve("0x1234567890123456789012345678901234567890")),
      signMessage: jest.fn().mockResolvedValue("0xfoo"),
    })),
    Contract: jest.fn().mockImplementation(() => paymasterContractMock),
    BigNumber: {
      from: jest.fn().mockImplementation((value: number) => BigInt(value)), 
    },
    utils: {
      defaultAbiCoder: {
        encode: jest.fn().mockImplementation(() => "0x"),
      },
    },
  },
}));

// 💡 These import mocks have to happen before we call import { estimateUserOperationGas }
// because estimateUserOperationGas imports the service manager produces SIDE EFFECTS (bad practice) like trying to connect to the DB
jest.mock("../../../../common/service-manager", () => ({
  entryPointMap: {
    1: [entryPointContract],
    2: [entryPointContract],
    3: [entryPointContract],
  },
  bundlerSimulationServiceMap: {
    1: {
      estimateUserOperationGas: estimateUserOperationGasMock,
    },
    3: {
      estimateUserOperationGas: estimateUserOperationGasMock,
    },
  },
  gasPriceServiceMap: {
    1: {
      getGasPrice: getGasPriceMock,
    },
  },
  networkServiceMap: {
    1: new EVMNetworkService({
      chainId: 1,
      rpcUrl: "https://random-rpc-url.com",
    }),
  },
}));

// Now we can import after we have mocked the dependencies
import { sponsorUserOperation } from "./handler";
import { UserOperationType } from "../../../../common/types";

describe("pm_sponsorUserOperation", () => {
  it("should sponsor a user operation", async () => {
    const mockUserOp: Partial<UserOperationType> = {
      sender: "0x1234567890123456789012345678901234567890",
      nonce: BigInt(1),
      initCode: "0x",
      callData: "0x",
      callGasLimit: BigInt(1000000),
      verificationGasLimit: BigInt(1000000),
      preVerificationGas: BigInt(1000000),
      maxFeePerGas: BigInt(1000000000),
      maxPriorityFeePerGas: BigInt(1000000000),
      paymasterAndData: "0x",
      signature: "0x",
    };

    const requestOptions: RequestOptions = {
      method: "POST",
      url: `/paymaster/${chainId}/${bundlerApiKey}`,
      params: { chainId, bundlerApiKey },
      body: {
        id: requestId,
        params: [mockUserOp],
      },
    };

    const request = httpMocks.createRequest(requestOptions);
    const response = httpMocks.createResponse();

    await sponsorUserOperation(request, response);

    expect(response.statusCode).toBe(200);
    const jsonData = response._getJSONData();
    expect(jsonData.id).toBe(requestId);
    expect(jsonData.result).toHaveProperty("paymasterAndData");
    expect(jsonData.result.paymasterAndData).not.toBe("0x");
  });
});
