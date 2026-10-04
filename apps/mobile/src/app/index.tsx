import React from "react";
import { ConnectionScreen, AuthScreen } from "../auth-screens";
import { useAuth } from "../state";
export default function SignInScreen() {
  const { connected } = useAuth();
  return connected ? <AuthScreen /> : <ConnectionScreen />;
}
