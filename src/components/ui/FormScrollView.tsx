import React from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

// Scroll container for any screen holding text inputs. Use this instead of a bare
// ScrollView so a focused field can never end up behind the keyboard:
//   - automaticallyAdjustKeyboardInsets: iOS grows the scroll inset by the keyboard
//     height while it's up, which lets UIKit scroll the focused input into view (and
//     leaves the fields below it reachable).
//   - keyboardShouldPersistTaps="handled": tapping a button/suggestion while typing
//     fires it, instead of being swallowed by the keyboard-dismiss tap.
//   - keyboardDismissMode="interactive": drag down to dismiss.
// Props spread last, so a caller can still override any of these.
//
// For a form inside a bottom sheet use <SheetBackdrop> instead — that lifts the whole
// sheet, and stacking the two would offset the content by the keyboard height twice.
export function FormScrollView(props: ScrollViewProps) {
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      {...props}
    />
  );
}
