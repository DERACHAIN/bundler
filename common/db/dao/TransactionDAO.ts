import { IBlockchainTransaction } from '../mongo/interface/IBlockchainTransaction';
import { ITransactionDAO } from '../interface/ITransactionDAO';
import { Mongo } from '../mongo/Mongo';

export class TransactionDAO implements ITransactionDAO {
  private _db;

  constructor() {
    this._db = Mongo.getInstance();
  }

  async save(chainId: number, transactionData: object): Promise<void> {
    await this._db.getBlockchainTransaction(chainId).insertMany([transactionData]);
  }

  async updateByTransactionId(
    chainId: number,
    id: string,
    data: IBlockchainTransaction,
  ): Promise<void> {
    await this._db.getBlockchainTransaction(chainId).updateOne({
      transactionId: id,
    }).update(data);
  }

  async getByTransactionId(chainId: number, id: string): Promise<IBlockchainTransaction | null> {
    const data = await this._db.getBlockchainTransaction(chainId).findOne({
      transactionId: id,
    });
    if (data) {
      return data;
    }
    return null;
  }
}
