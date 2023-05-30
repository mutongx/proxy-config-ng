import { Outbound } from "./types";

class UniqueKeyGenerator {

  counter: Map<string, number> = new Map();
  keys: string[] = [];

  push(key: string): string {
    if (!this.counter.has(key)) {
      this.counter.set(key, 0);
    }
    const count = this.counter.get(key)!;
    this.counter.set(key, count + 1);
    const value = `${key}-${count}`;
    this.keys.push(value);
    return value;
  }

};

export interface Configurator {
  generate(userConfig: any, outboundsConfig: Outbound[]): any;
}

export class SingboxConfigurator implements Configurator {

  keyGenerator = new UniqueKeyGenerator();

  addTag(o: Outbound) {
    const tag = this.keyGenerator.push(`${o.host}-${o.config.type}`);
    o.config.tag = tag;
    return o;
  }

  generate(userConfig: any, outboundsConfig: Outbound[]) {
    const outbounds = outboundsConfig.map((o) => this.addTag(o)).map((o) => o.config);
    var result: any = {
      "dns": {
        "servers": [
          {
            "tag": "cloudflare",
            "address": "tls://1.1.1.1"
          }
        ],
      },
      "inbounds": [
        {
          "type": "mixed",
          "listen": userConfig.listen || "127.0.0.1",
          "listen_port": userConfig.listen_port || 5353,
          "sniff": true,
        }
      ],
      "outbounds": [
        ...outbounds,
        {
          "type": "selector",
          "tag": "proxy",
          "outbounds": this.keyGenerator.keys,
        },
        {
          "type": "direct",
          "tag": "direct",
        },
        {
          "type": "block",
          "tag": "block",
        },
        {
          "type": "dns",
          "tag": "dns",
        },
      ],
      "route": {
        "rules": [
          {
            "protocol": "dns",
            "outbound": "dns",
          },
          {
            "geoip": ["private"],
            "outbound": "direct"
          },
        ],
        "auto_detect_interface": true,
      }
    }
    if (userConfig.enable_tun) {
      result["inbounds"].push({
        "type": "tun",
        "inet4_address": "172.19.0.1/30",
        "auto_route": true,
        "strict_route": true,
        "sniff": true,
      })
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

  keyGenerator = new UniqueKeyGenerator();

  converter: { [key: string]: (o: Outbound) => any } = {
    trojan: (o: Outbound) => {
      const name = this.keyGenerator.push(`${o.host}-${o.config.type}`);
      return {
        "name": name,
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
      "mode": "rule",
      "proxies": proxies,
      "proxy-groups": [
        {
          "name": "PROXY",
          "type": "select",
          "proxies": this.keyGenerator.keys,
        }
      ]
    }
    if (userConfig.external_controller) {
      result["external-controller"] = userConfig.external_controller;
    }
    return result;
  }
};
