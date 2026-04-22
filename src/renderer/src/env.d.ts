/// <reference types="vite/client" />

/**
 * `?url` 쿼리를 붙인 asset import 의 기본 export 는 string (해시된 URL).
 * vite/client 에는 일부만 선언되어 있어, 폰트 확장자는 별도로 보강한다.
 */
declare module '*.ttf?url' {
  const url: string;
  export default url;
}
declare module '*.otf?url' {
  const url: string;
  export default url;
}
declare module '*.woff?url' {
  const url: string;
  export default url;
}
declare module '*.woff2?url' {
  const url: string;
  export default url;
}
