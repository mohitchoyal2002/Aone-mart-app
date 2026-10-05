import React from "react";
import { ScrollView, KeyboardAvoidingView as Avoiding } from "react-native";
export const KeyboardAwareScrollView = React.forwardRef<any, any>(
  (props, ref) => <ScrollView {...props} ref={ref} />,
);
export const KeyboardAvoidingView = Avoiding;
export const useKeyboardState = (selector: any) =>
  selector({ isVisible: false, height: 0 });
export const KeyboardToolbar: any = () => null;
KeyboardToolbar.Prev = KeyboardToolbar.Next = KeyboardToolbar.Done = () => null;
