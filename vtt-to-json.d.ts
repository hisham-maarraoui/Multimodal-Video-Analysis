declare module 'vtt-to-json' {
  function vttToJson(path: string): Promise<any[]>;
  export default vttToJson;
} 