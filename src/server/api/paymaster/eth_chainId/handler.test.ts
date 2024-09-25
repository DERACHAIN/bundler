import httpMocks, { RequestOptions } from "node-mocks-http";
import { getChainId } from "./handler";

const chainId = "1"; // Updated to Ethereum mainnet
const requestId = "123";

describe("eth_chainId", () => {
  it("should return chainId in hex if the chain is supported", async () => {
    // Create the RPC request
    const requestOptions: RequestOptions = {
      method: "POST",
      url: `/paymaster/${chainId}/test`, // Updated router URL
      params: { chainId },
      body: {
        id: requestId,
        params: [],
      },
    };

    // Send the request
    const request = httpMocks.createRequest(requestOptions);
    const response = httpMocks.createResponse();
    await getChainId(request, response);

    // console.log(response._getJSONData());

    // Check the returned values
    expect(response.statusCode).toBe(200);
    expect(response._getJSONData()).toEqual({
      jsonrpc: "2.0",
      id: requestId,
      result: "0x1", // 1 in hex (Ethereum mainnet)
    });
  });
});
