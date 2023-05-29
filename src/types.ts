export interface Env {
  SECRETS: KVNamespace;
  DB: D1Database;
  GITHUB_REPO: string;
  GITHUB_REF: string;
  GITHUB_TOKEN: string;
};

export type User = {
  name: string;
  token: string;
  config: any;
};

export type Host = {
  name: string;
  addr4: string;
  addr6: string;
};

export type Proxy = {
  host: string;
  port: number;
  type: string;
  config: any;
  tag: string;
};

export type Access = {
  user: string;
  class: string;
  tag: string;
};

export type Secret = {
  name: string;
  value: string;
};
