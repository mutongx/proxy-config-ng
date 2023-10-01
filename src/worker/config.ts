import { Outbound, Rule, Dns } from "./types";

class ProxyMapper {

  counter: Map<string, number> = new Map();
  proxies: string[] = [];
  hosts: Map<string, string[]> = new Map();
  groups: Map<string, string[]> = new Map();

  push(host: string, type: string, groups: Array<string>): string {
    // group by ${host-type}, and add to counter
    const key = `${host}-${type}`
    if (!this.counter.has(key)) {
      this.counter.set(key, 0);
    }
    const count = this.counter.get(key)!;
    this.counter.set(key, count + 1);
    // proxy name is ${host-type-count}
    const name = `${key}-${count}`;
    this.proxies.push(name);
    // default group by ${host-type}
    if (!this.hosts.has(host)) {
      this.hosts.set(host, []);
    }
    this.hosts.get(host)?.push(name);
    // custom group name
    for (const group of groups) {
      if (!this.groups.has(group)) {
        this.groups.set(group, []);
      }
      this.groups.get(group)?.push(name);
    }
    return name;
  }

};

export class SingboxConfigurator {

  mapper = new ProxyMapper();

  addProxy(o: Outbound) {
    const tag = this.mapper.push(o.host, o.type, o.groups);
    o.config.tag = tag;
    return o;
  }

  create(userConfig: any, outboundsConfig: Outbound[], rulesConfig: Rule[], dnsConfig: Dns[]) {
    const outbounds = outboundsConfig.map((o) => this.addProxy(o)).map((o) => o.config);
    var result: any = {
      "log": {
        "level": userConfig.log_level || "info",
      },
      "dns": {
        "servers": [
          ...dnsConfig.map((s) => ({
            ...s.config,
            "tag": s.name,
          }))
        ],
        "rules": [
          ...dnsConfig.filter((s) => s.rule !== null).map((s) => ({
            ...s.rule,
            "server": s.name,
          })).filter((s) => s !== null),
        ]
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
          "outbounds": this.mapper.proxies,
        },
        ...Array.from(this.mapper.groups, ([key, value]) => ({
          "type": "selector",
          "tag": key,
          "outbounds": value,
        })),
        ...Array.from(this.mapper.hosts, ([key, value]) => ({
          "type": "selector",
          "tag": key,
          "outbounds": value,
        })),
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
            "geoip": "private",
            "outbound": "direct"
          },
          ...rulesConfig.map((r) => r.config),
        ],
        "final": "proxy",
        "auto_detect_interface": true,
      }
    }
    if (userConfig.enable_tun) {
      result["inbounds"].push({
        "type": "tun",
        "tag": "tun",
        "inet4_address": "172.27.0.1/30",
        "auto_route": true,
        "strict_route": true,
        "sniff": true,
      })
    }
    if (userConfig.external_controller) {
      result["experimental"] = {
        "clash_api": {
          "external_controller": userConfig.external_controller,
          "external_ui": "ui",
          "external_ui_download_url": "https://github.com/MetaCubeX/Yacd-meta/archive/gh-pages.zip",
          "secret": userConfig.external_controller_secret || "",
          "store_selected": true
        }
      }
    }
    return result;
  }
};

export class ClashConfigurator {

  mapper = new ProxyMapper();

  processor: { [key: string]: (o: Outbound, u: any) => any } = {
    trojan: (o: Outbound, u: any) => {
      const name = this.mapper.push(o.host, o.type, o.groups);
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
    },
    vless: (o: Outbound, u: any) => {
      if (u.clash_compatibility != "meta") {
        return null;
      }
      const name = this.mapper.push(o.host, o.type, o.groups);
      return {
        "name": name,
        "type": "vless",
        "server": o.config.server,
        "port": o.config.server_port,
        "uuid": o.config.uuid,
        "flow": o.config.flow,
        "skip-cert-verify":
          (o.config.tls.certificate || o.config.tls.insecure) ? true : false,
      }
    },
    hysteria: (o: Outbound, u: any) => {
      if (u.clash_compatibility != "meta") {
        return null;
      }
      const name = this.mapper.push(o.host, o.type, o.groups);
      return {
        "name": name,
        "type": "hysteria",
        "server": o.config.server,
        "port": o.config.server_port,
        "auth-str": o.config.auth_str,
        "up": o.config.up,
        "down": o.config.down,
        "alpn": o.config.tls.alpn,
        "skip-cert-verify":
          (o.config.tls.certificate || o.config.tls.insecure) ? true : false,
      }
    }
  }

  addProxy(o: Outbound, u: any) {
    const fn = this.processor[o.config.type];
    if (fn === undefined) {
      return null;
    }
    return fn(o, u);
  }

  *iterate(obj: any) {
    if (!obj) {
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        yield item;
      }
    } else {
      yield obj;
    }
  }

  *translate(rules: Rule[]) {
    for (const rule of rules) {
      var outbound: string = rule.config.outbound;
      if (outbound == "proxy" || outbound == "direct") {
        outbound = outbound.toUpperCase();
      }
      for (const item of this.iterate(rule.config.domain_suffix)) {
        yield `DOMAIN-SUFFIX,${item},${outbound}`
      }
      for (const item of this.iterate(rule.config.geoip)) {
        yield `GEOIP,${item.toUpperCase()},${outbound}`
      }
    }
  }

  create(userConfig: any, outboundsConfig: Outbound[], rules: Rule[]) {
    const proxies = outboundsConfig
      .map((o) => this.addProxy(o, userConfig))
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
          "proxies": this.mapper.proxies,
        },
        ...Array.from(this.mapper.groups, ([key, value]) => ({
          "name": key,
          "type": "select",
          "proxies": value,
        })),
        ...Array.from(this.mapper.hosts, ([key, value]) => ({
          "name": key,
          "type": "select",
          "proxies": value,
        })),
      ],
      "rules": [
        ...this.translate(rules),
        "MATCH,PROXY",
      ]
    }
    if (userConfig.external_controller) {
      result["external-controller"] = userConfig.external_controller;
    }
    return result;
  }
};