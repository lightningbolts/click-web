import 'next/link';

// `next/link` is typed from the Pages-router Link, which leaves out this App-router prop.
declare module 'next/dist/client/link' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- must match the original declaration
  interface LinkProps<RouteInferType = any> {
    /** Fetch the whole page, not just its shell, on hover or touch (`experimental.dynamicOnHover`). */
    unstable_dynamicOnHover?: boolean;
  }
}
