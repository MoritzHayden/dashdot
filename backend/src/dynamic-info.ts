import { CpuLoad, RamLoad, StorageLoad } from 'dashdot-shared';
import { interval, mergeMap, Observable, ReplaySubject } from 'rxjs';
import si, { Systeminformation } from 'systeminformation';
import util from 'util';
import { CONFIG } from './config';
import { getStaticServerInfo } from './static-info';

const createBufferedInterval = <R>(
  name: string,
  bufferSize: number,
  intervalMs: number,
  factory: () => Promise<R>
): Observable<R> => {
  const buffer = new ReplaySubject<R>(bufferSize);

  // Instantly load first value
  factory()
    .then(value => {
      console.log(
        `First measurement [${name}]:`,
        util.inspect(value, {
          showHidden: false,
          depth: null,
          colors: true,
        })
      );

      buffer.next(value);
    })
    .catch(err => buffer.error(err));

  // Load values every intervalMs
  interval(intervalMs).pipe(mergeMap(factory)).subscribe(buffer);

  return buffer.asObservable();
};

export const cpuObs = createBufferedInterval(
  'CPU',
  CONFIG.cpu_shown_datapoints,
  CONFIG.cpu_poll_interval,
  async (): Promise<CpuLoad> => {
    const staticInfo = await getStaticServerInfo();
    const loads = (await si.currentLoad()).cpus;

    let temps: Systeminformation.CpuTemperatureData['cores'] = [];
    if (CONFIG.enable_cpu_temps) {
      const threadsPerCore = staticInfo.cpu.threads / staticInfo.cpu.cores;
      temps = (await si.cpuTemperature()).cores.flatMap(temp =>
        Array(threadsPerCore).fill(temp)
      );
    }

    return loads.map(({ load }, i) => ({
      load,
      temp: temps[i],
      core: i,
    }));
  }
);

export const ramObs = createBufferedInterval(
  'RAM',
  CONFIG.ram_shown_datapoints,
  CONFIG.ram_poll_interval,
  async (): Promise<RamLoad> => {
    return (await si.mem()).active;
  }
);

export const storageObs = createBufferedInterval(
  'Storage',
  1,
  CONFIG.storage_poll_interval,
  async (): Promise<StorageLoad> => {
    const data = await si.fsSize();
    const root = data.find(d => d.mount === '/');

    return root?.used!;
  }
);
