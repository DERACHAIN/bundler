/* eslint-disable import/no-import-module-exports */
import crypto from "crypto-js";
import fs, { existsSync } from "fs";
import _, { isNumber } from "lodash";
import path from "path";
import nodeconfig from "config";
import { logger } from "../common/logger";

import { ConfigType, IConfig } from "./interface/IConfig";

const log = logger.child({
  module: module.filename.split("/").slice(-4).join("/"),
});

const KEY_SIZE = 32;
const PBKDF2_ITERATIONS = 310000;
const AES_PADDING = crypto.pad.Pkcs7;
const AES_MODE = crypto.mode.CBC;

export function merge(
  userConfig: Partial<ConfigType>,
  staticConfig: any,
): ConfigType {
  // clone so we don't mutate the original config
  const clone = _.cloneDeep(userConfig);

  // preserve the supported networks from the user config because
  // we want to override the default from static-config if it's present in the user config
  const supportedNetworks = _.clone(clone.supportedNetworks);

  // perform the merge
  const merged = _.merge(clone, staticConfig);

  // restore the supported networks array
  if (supportedNetworks && supportedNetworks.length) {
    merged.supportedNetworks = supportedNetworks;
  }

  if (nodeconfig.has("networks")) {
    const networks: any = nodeconfig.get("networks");

    const enabledNetworks: string[] = [];
    for (const chainId of Object.keys(networks)) {
      if (nodeconfig.has(`networks.${chainId}.enabled`)) {
        const enabled = nodeconfig.get(`networks.${chainId}.enabled`);
        if (enabled) {
          enabledNetworks.push(chainId);
        }
      }

      if (nodeconfig.has(`networks.${chainId}.relayers`)) {
        const relayers: any = nodeconfig.get(`networks.${chainId}.relayers`);
        console.log(`Relayers for chainId: ${chainId}`);
        console.log(relayers);

        for (let i = 0; i < relayers.length; i += 1) {
          // TODO: Use get() and check if relayers.minCount exists
          merged.relayerManagers[i].minRelayerCount[chainId] = nodeconfig.get(
            `networks.${chainId}.relayers.RM${i + 1}.minCount`,
          );

          merged.relayerManagers[i].maxRelayerCount[chainId] = nodeconfig.get(
            `networks.${chainId}.relayers.RM${i + 1}.maxCount`,
          );

          merged.relayerManagers[i].inactiveRelayerCountThreshold[chainId] =
            nodeconfig.get(
              `networks.${chainId}.relayers.RM${i + 1}.inactiveCountThreshold`,
            );

          merged.relayerManagers[i].pendingTransactionCountThreshold[chainId] =
            nodeconfig.get(
              `networks.${chainId}.relayers.RM${i + 1}.pendingTransactionCountThreshold`,
            );

          merged.relayerManagers[i].fundingRelayerAmount[chainId] =
            nodeconfig.get(
              `networks.${chainId}.relayers.RM${i + 1}.fundingAmount`,
            );

          merged.relayerManagers[i].fundingBalanceThreshold[chainId] =
            nodeconfig.get(
              `networks.${chainId}.relayers.RM${i + 1}.fundingBalanceThreshold`,
            );

          merged.relayerManagers[i].newRelayerInstanceCount[chainId] =
            nodeconfig.get(
              `networks.${chainId}.relayers.RM${i + 1}.newInstanceCount`,
            );
        }
      }

      if (nodeconfig.has(`networks.${chainId}.providers`)) {
        const providers: any = nodeconfig.get(`networks.${chainId}.providers`);

        if (!merged?.chains.provider) {
          merged.chains.provider = {};
        }

        if (providers.length > 0) {
          const [firstProvider] = providers;
          merged.chains.provider[chainId] = firstProvider;
        }
      }

      // update the updateFrequencyInSeconds
      if (nodeconfig.has(`networks.${chainId}.updateFrequencyInSeconds`)) {
        merged.chains.updateFrequencyInSeconds[chainId] = nodeconfig.get(
          `networks.${chainId}.updateFrequencyInSeconds`,
        );
      }
    }

    if (enabledNetworks.length > 0) {
      merged.supportedNetworks = enabledNetworks;
    }
  }

  // throw new Error("🚫⛔ STOP HERE");

  return merged;
}

export class Config implements IConfig {
  config: ConfigType;

  constructor() {
    log.info("Config loading started");
    try {
      // decrypt the config and load it
      const encryptedEnvPath =
        process.env.BUNDLER_CONFIG_PATH || "config.json.enc";

      const staticConfigPath =
        process.env.BUNDLER_STATIC_CONFIG_PATH ||
        "src/config/static-config.json";

      const passphrase = process.env.CONFIG_PASSPHRASE;
      if (!passphrase) {
        throw new Error("Passphrase for config required in .env file");
      }

      if (!existsSync(encryptedEnvPath)) {
        throw new Error(`Invalid ENV Path: ${encryptedEnvPath}`);
      }
      const ciphertext = fs.readFileSync(encryptedEnvPath, "utf8");
      // First 44 bits are Base64 encodded HMAC
      const hashInBase64 = ciphertext.substr(0, 44);

      // Next 32 bits are the salt
      const salt = crypto.enc.Hex.parse(ciphertext.substr(44, 32));

      // Next 32 bits are the initialization vector
      const iv = crypto.enc.Hex.parse(ciphertext.substr(44 + 32, 32));

      // Rest is encrypted .env
      const encrypted = ciphertext.substr(44 + 32 + 32);

      // Derive key from passphrase
      const key = crypto.PBKDF2(passphrase, salt, {
        keySize: KEY_SIZE / 32,
        iterations: PBKDF2_ITERATIONS,
      });

      const bytes = crypto.AES.decrypt(encrypted, key, {
        iv,
        padding: AES_PADDING,
        mode: AES_MODE,
      });

      const plaintext = bytes.toString(crypto.enc.Utf8);

      // Verify HMAC
      const decryptedHmac = crypto.HmacSHA256(plaintext, key);
      const decryptedHmacInBase64 = crypto.enc.Base64.stringify(decryptedHmac);

      if (decryptedHmacInBase64 !== hashInBase64) {
        throw new Error("Error: HMAC does not match");
      }
      const data = JSON.parse(plaintext) as ConfigType;
      const staticConfig = JSON.parse(
        fs.readFileSync(path.resolve(staticConfigPath), "utf8"),
      );

      this.config = merge(data, staticConfig);

      // if (supportsConfigV2(this.config)) {
      // log.info("Config is using v2");

      // this should load the config from the environment
      // const config = new ConfigV2()

      // and then apply it to the current config
      // this.config = config.merge(this.config)
      // }

      // this.validate();
      log.info("Config loaded successfully");
    } catch (error) {
      log.error("Config loading failed", error);
      throw error;
    }
  }

  validate(): boolean {
    // check for each supported networks if the config is valid
    for (const chainId of this.config.supportedNetworks) {
      if (!this.config.supportedTransactionType[chainId].length) {
        throw new Error(
          `No supported transaction type for chain id ${chainId}`,
        );
      }

      if (!this.config.chains.currency[chainId]) {
        throw new Error(`Currency required for chain id ${chainId}`);
      }
      if (!this.config.chains.provider[chainId]) {
        throw new Error(`Provider required for chain id ${chainId}`);
      }
      if (!this.config.chains.decimal[chainId]) {
        throw new Error(`Decimals required for chain id ${chainId}`);
      }

      if (!isNumber(this.config.relayer.nodePathIndex)) {
        throw new Error("Relayer node path index required");
      }

      if (!this.config.relayerManagers.length) {
        throw new Error(`Relayer manager required for chain id ${chainId}`);
      }
    }
    return true;
  }

  update(data: object): boolean {
    this.config = _.merge(this.config, data);
    return true;
  }

  get(): ConfigType {
    return this.config;
  }

  active(): boolean {
    return !!this.config.queueUrl;
  }
}

export const configInstance = new Config();
export const config = configInstance.get();
