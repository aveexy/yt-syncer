
enum MsgType {
  Info= 'INFO',
  Warning = 'WARN',
  Error = 'ERRR',
  Verbose = 'VERB',
}

const sys = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underscore: "\x1b[4m",
  reverse: "\x1b[7m",
  strikethrough: "\x1b[9m",
  backoneline: "\x1b[1A",
  cleanthisline: "\x1b[K"
}

const colors = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const msgTypeColorMap = {
  [MsgType.Info]:  '',
  [MsgType.Warning]:  colors.yellow,
  [MsgType.Error]:  colors.red,
  [MsgType.Verbose]:  colors.cyan,
}

interface LogSharedData {
  prefixLength: number;
}

export class Log {
  protected sharedData: LogSharedData = {
    prefixLength: 3,
  };

  protected writeToLog(type: MsgType, prefix: string, msg: string) {
    if (this.sharedData.prefixLength <= 10 && prefix.length > this.sharedData.prefixLength) {
      this.sharedData.prefixLength = Math.min(prefix.length, 10);
    }

    const prefixStr = prefix.substring(0, 10).padEnd(this.sharedData.prefixLength, ' ');

    console.log(`${msgTypeColorMap[type]}[${type}]${sys.reset}[${prefixStr}]${msg[0] === '[' ? '' : ' '}${type === MsgType.Error ? colors.red : ''}${msg}${sys.reset}`);
  }

  public info(prefix: string, msg: string) {
    this.writeToLog(MsgType.Info, prefix, msg);
  }

  public warning(prefix: string, msg: string) {
    this.writeToLog(MsgType.Warning, prefix, msg);
  }

  public error(prefix: string, msg: string) {
    this.writeToLog(MsgType.Error, prefix, msg);
  }

  public verbose(prefix: string, msg: string) {
    this.writeToLog(MsgType.Verbose, prefix, msg);
  }

  public getInstanceWithPrefix(prefix: string) {
    return new LogWithPrefix(this.sharedData, prefix);
  }
}

export class LogWithPrefix extends Log {
  protected readonly prefix: string;

  constructor(sharedData: LogSharedData, prefix: string) {
    super();
    this.prefix = prefix;
    this.sharedData = sharedData;
  }

  public info(msg: string) {
    this.writeToLog(MsgType.Info, this.prefix, msg);
  }

  public warning(msg: string) {
    this.writeToLog(MsgType.Warning, this.prefix, msg);
  }

  public error(msg: string) {
    this.writeToLog(MsgType.Error, this.prefix, msg);
  }

  public verbose(msg: string) {
    this.writeToLog(MsgType.Verbose, this.prefix, msg);
  }
}

const defaultLogger = new Log();

export default defaultLogger;
