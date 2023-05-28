export type User = {
  name: string,
  token: string,
  config: object | null,
};

export type Access = {
  user: string,
  class: string,
  tag: string
};

export type Proxy = {
  host: string,
  port: number,
  type: string,
  config: object | null;
  tag: string,
};
