import * as net from "net";
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import defaultLogger, {Log, LogWithPrefix} from "./log";


export class IPC {
  private readonly socketPath: string;

  private readonly log: LogWithPrefix;

  private server: net.Server | null = null;

  constructor(socketName: string = 'ytDlpAutomation') {
    this.socketPath = path.join(os.tmpdir(), `${socketName}.sock`);
    this.log = defaultLogger.getInstanceWithPrefix('IPC');
  }

  public async serve() {
    this.log.verbose('Starting server...');

    const alreadyListening = await new Promise<boolean>((resolve, reject) => {
      const client = net.connect({ path: this.socketPath }, () => {
        client.write('check-existing-instance', () => {
          resolve(true);
        });
      });

      client.on('error', async () => {
        try {
          await fs.unlink(this.socketPath);
        } catch (e) {
          if (e && typeof e === 'object' && 'code' in e && e.code !== 'ENOENT') {
            reject(e);
          }
        }

        resolve(false);
      });
    });

    if (alreadyListening) {
      this.log.error('another instance is already running, aborting');
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this.server = net.createServer();

      this.server.on('error', (e) => {
        this.log.error(e.message);
      });


      this.server?.on('listening', () => {
        resolve(true);
      });

      this.server.listen(this.socketPath);
    });
  }

  public async close() {
    return new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.log.verbose('Closing server...')

        this.server.close(async (e) => {
          if (e) {
            this.log.error(e.message);
            reject(e);
          }

          this.log.verbose('Closed server');
          resolve();
        });
      }
    })
  }
}

let defaultInstance = new IPC();

function replaceDefaultInstance(inst: IPC) {
  defaultInstance = inst;
}

(defaultInstance as any)['replace'] = replaceDefaultInstance;

export default defaultInstance as IPC & { replace: typeof replaceDefaultInstance };
