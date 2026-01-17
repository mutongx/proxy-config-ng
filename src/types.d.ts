// Cloudflare Workers type definitions

interface Env {
  DB: D1Database;
}

// Database type definitions

interface User {
  name: string;
  token: string;
  config: {
    // Environment
    ipv6: boolean | undefined;
    // Mixed
    listen: string | undefined;
    listen_port: number | undefined;
    // Tun
    enable_tun: boolean | undefined;
    tun_auto_route: boolean | undefined;
    tun_auto_redirect: boolean | undefined;
    tun_strict_route: boolean | undefined;
    tun_exclude_tailscale_network: boolean | undefined;
    tun_reject_quic: boolean | undefined;
    // Fake IP
    enable_fakeip: boolean | undefined;
    fakeip_inet4_range: string | undefined;
    fakeip_inet6_range: string | undefined;
    // TProxy
    enable_tproxy: boolean | undefined;
    tproxy_listen: string | undefined;
    tproxy_listen_port: number | undefined;
    // Tailscale
    enable_tailscale: boolean | undefined;
    tailscale_control_url: string | undefined;
    tailscale_auth_key: string | undefined;
    tailscale_network: string[] | undefined;
    // Clash API
    enable_clash_api: boolean | undefined;
    clash_api_listen: string | undefined;
    clash_api_token: string | undefined;
    // App
    log_level: string | undefined;
  };
}

interface Host {
  name: string;
  addr: string;
  addr6: string;
}

interface Variable {
  name: string;
  value: string;
}

interface Proxy {
  host: string;
  port: number;
  type: string;
  variable: any;
  config: {
    selector: string[] | undefined;
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
