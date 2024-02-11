import { ConfigObject } from "./config";

export type User = {
    name: string;
    token: string;
    config: ConfigObject;
};

export type Host = {
    name: string;
    addr: string;
    addr6: string;
};

export type Proxy = {
    host: string;
    port: number;
    type: string;
    config: ConfigObject;
    tag: string;
};

export type Rule = {
    name: string;
    config: ConfigObject;
    tag: string;
};

export type Dns = {
    name: string;
    config: ConfigObject;
    rule: ConfigObject;
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
