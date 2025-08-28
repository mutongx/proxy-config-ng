// Cloudflare Workers type definitions

interface Env {
  DB: D1Database,
}

// Database type definitions

interface User {
  name: string;
  token: string;
  config: {
    ipv6: boolean | undefined,
    log_level: string | undefined,
    listen: string | undefined,
    listen_port: number | undefined,
    enable_tun: boolean | undefined,
    tun_auto_route: boolean | undefined,
    tun_auto_redirect: boolean | undefined,
    tun_strict_route: boolean | undefined,
    tun_route_exclude_address: string[] | undefined,
    enable_tproxy: boolean | undefined,
    tproxy_listen: string | undefined,
    tproxy_listen_port: number | undefined,
    enable_fakeip: boolean | undefined,
    fakeip_inet4_range: string | undefined,
    fakeip_inet6_range: string | undefined,
    enable_clash_api: boolean | undefined,
    clash_api_listen: string | undefined,
    clash_api_token: string | undefined,
  };
}

interface Host {
  name: string;
  addr: string;
  addr6: string;
}

interface Secret {
  name: string;
  value: string;
}

interface Proxy {
  host: string;
  port: number;
  type: string;
  config: {
    selector: string[] | undefined,
  };
  label: string;
}
  
interface Dns {
  name: string;
  type: string;
  addr: string;
  detour: string;
  label: string;
}

interface Access {
  user: string;
  class: string;
  label: string;
}

interface RuleSet {
  name: string;
  seq: number;
  config: any;
}

interface RuleAction {
  user: string;
  class: string;
  inbound: string | null;
  rule_set: string;
  rule_action: string;
  config: any;
  priority: number;
}
