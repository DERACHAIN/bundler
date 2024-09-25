import { PaymasterData } from "../../../../common/types";
import { RPCResponse } from "../shared/response";

export class SponsorUserOperationResponse extends RPCResponse {
  constructor(
    public result: PaymasterData,
    requestId?: number,
  ) {
    super(requestId);
  }
}
