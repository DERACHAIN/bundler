import { Request, Response } from 'express';
import { logger } from '../../../../common/log-config';
import { feeOptionsService } from '../../services';

const log = logger(module);

export const feeOptionsApi = async (req: Request, res: Response) => {
  const chainIdInString = req.query.chainId as string;
  const chainId = Number(chainIdInString);
  const response = await feeOptionsService({ chainId });
  try {
    if (response.error) {
      return res.status(400).json({
        msg: 'bad request',
        error: response.error,
      });
    }
    return res.json({
      msg: 'all ok',
      data: {
        chainId,
        ...response,
      },
    });
  } catch (error) {
    log.error(`Error in relay ${error}`);
    return res.status(500).json({
      error,
    });
  }
};