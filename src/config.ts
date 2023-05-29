import { Outbound } from "./types";

export interface Configurator {
  generate(userConfig: any, outboundsConfig: Outbound[]): any;
}

export class SingboxConfigurator implements Configurator {
  generate(userConfig: any, outboundsConfig: Outbound[]) {
    var result: any = {
      "inbounds": [
        {
          "type": "mixed",
          "listen": userConfig.listen || "127.0.0.1",
          "listen_port": userConfig.listen_port || 5353,
        }
      ],
      "outbounds": outboundsConfig.map((o) => o.config),
    }
    if (userConfig.external_controller) {
      result["experimental"] = {
        "clash_api": {
          "external_controller": userConfig.external_controller,
        }
      }
    }
    return result;
  }
};

export class ClashConfigurator implements Configurator {

  counter: Map<string, number> = new Map();

  converter: { [key: string]: (o: Outbound) => any } = {
    trojan: (o: Outbound) => {
      const label = `${o.host}-${o.config.type}`
      if (!this.counter.has(label)) {
        this.counter.set(label, 0);
      }
      const idx = this.counter.get(label)!;
      this.counter.set(label, idx + 1);
      return {
        "name": `${label}-${idx}`,
        "type": "trojan",
        "server": o.config.server,
        "port": o.config.server_port,
        "password": o.config.password,
        "alpn": o.config.tls.alpn,
        "skip-cert-verify":
          (o.config.tls.certificate || o.config.tls.insecure) ? true : false,
      }
    }
  }

  convert(o: Outbound) {
    const fn = this.converter[o.config.type];
    if (fn === undefined) {
      return null;
    }
    return fn(o);
  }

  generate(userConfig: any, outboundsConfig: any[]) {
    const proxies = outboundsConfig
      .map((o) => this.convert(o))
      .filter((value) => value != null);
    var result: any = {
      "mixed-port": userConfig.listen_port || 7890,
      "bind-address": userConfig.listen || "127.0.0.1",
      "allow-lan": userConfig.listen ? true : false,
      "mode": "global",
      "proxies": proxies,
    }
    if (userConfig.external_controller) {
      result["external-controller"] = userConfig.external_controller;
    }
    return result;
  }
};
