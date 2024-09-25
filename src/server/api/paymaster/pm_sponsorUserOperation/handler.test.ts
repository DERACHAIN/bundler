import httpMocks, { RequestOptions } from "node-mocks-http";
import { sponsorUserOperation } from "./handler";
import { UserOperationType } from "../../../../common/types";

const chainId = "1"; // Ethereum mainnet
const requestId = "123";
const bundlerApiKey = "test-api-key";

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
