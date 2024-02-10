import React, { Dispatch, useState } from "react"
import { client } from '@passwordless-id/webauthn'

interface TokenTextBoxProps {
    setToken: Dispatch<string>
}

const TokenTextBox = ({ setToken }: TokenTextBoxProps) => {
    return <input type="text" onChange={(ev) => setToken(ev.target.value)}/>
}

interface RegisterButtonProps {
    token: string | undefined
}

const RegisterButton = ({ token }: RegisterButtonProps) => {
    async function doRegister() {
        fetch("/challenge?usage=register", { method: "POST" })
            .then((resp) => resp.json() as Promise<{value: string}> )
            .then((challenge) => client.register("", challenge.value, {}) )
            .then((register) => fetch(`/register?token=${token || ''}`, { body: JSON.stringify(register), method: "POST"}));
    }
    return <button onClick={doRegister}>Register</button>
}

const AuthenticateButton = () => {
    async function doAuthenticate() {
        fetch("/challenge?usage=authenticate", { method: "POST" })
            .then((resp) => resp.json() as Promise<{value: string}> )
            .then((challenge) => client.authenticate([], challenge.value) )
            .then((authenticate) => fetch("/authenticate", { body: JSON.stringify(authenticate), method: "POST" }));
    }
    return <button onClick={doAuthenticate}>Authenticate</button>
}

const App = () => {
    const [token, setToken] = useState<string>();
    return (
        <div>
            <TokenTextBox setToken={setToken} />
            <RegisterButton token={token} />
            <AuthenticateButton />
        </div>
    )
}

export default App
