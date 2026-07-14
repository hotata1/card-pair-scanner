/// <reference types="vite/client" />

/** package.json の version(vite.config.ts の define で注入)。 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** AWS認識エンジン(Lambda+API Gateway)のエンドポイントURL。未設定ならエンジン選択時にフォールバック。 */
  readonly VITE_AWS_RECOGNIZE_URL?: string;
  /** Cognito Hosted UIのドメイン(例: https://xxx.auth.ap-northeast-1.amazoncognito.com)。未設定ならログインゲート自体を無効化(ローカル開発用)。 */
  readonly VITE_COGNITO_DOMAIN?: string;
  /** CognitoアプリクライアントID。 */
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
