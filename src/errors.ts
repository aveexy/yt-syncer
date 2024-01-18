export class TimeoutError extends Error {
  constructor(sec: number) {
    super(`Timeout of ${sec}s reached`);
  }
}

export class NoneZeroReturnCodeError extends Error {
  constructor(code: number) {
    super(`Return code was ${code}`);
  }
}

export class InvalidJsonError extends Error {
  constructor(origMessage: string) {
    super(`Invalid JSON received: ${origMessage}`);
  }
}