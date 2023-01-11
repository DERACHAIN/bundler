import { IEVMAccount } from 'fee-management/dist/relayer-node-interfaces/IEVMAccount';
import { AppConfig } from 'fee-management/dist/types';
import { ICacheService } from '../../cache';
import { ITokenPrice } from '../../token-price/interface/ITokenPrice';

export type FeeManagerParams = {
    masterFundingAccountSCW: IEVMAccount;
    relayerAddressesSCW: String[];
    masterFundingAccountCCMP: IEVMAccount;
    relayerAddressesCCMP: String[];
    appConfig: AppConfig;
    dbUrl: string;
    tokenPriceService: ITokenPrice;
    cacheService: ICacheService;
    labelSCW: string | undefined;
    labelCCMP: string | undefined;
};