export interface PriceChartEntry {
  id: string;
  validFrom: string;
  validTo: string | null;
  priceNet: string;
  annulled?: boolean;
}

export interface PriceChartPoint {
  id: string;
  date: string;
  value: number;
  x: number;
  y: number;
}

export interface PriceChartModel {
  points: PriceChartPoint[];
  stepPath: string;
  min: number;
  max: number;
}

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 220;
const PADDING_X = 48;
const PADDING_Y = 24;

function utcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Costruisce un grafico a gradini: un prezzo resta valido fino alla data del
 * successivo, quindi una diagonale suggerirebbe valori intermedi mai esistiti.
 */
export function buildPriceChart(
  entries: readonly PriceChartEntry[],
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
): PriceChartModel | null {
  const byDate = new Map<
    string,
    { id: string; date: string; timestamp: number; value: number; inputIndex: number }
  >();

  entries.forEach((entry, inputIndex) => {
    if (entry.annulled || entry.validTo === entry.validFrom) return;
    const timestamp = utcDate(entry.validFrom);
    const value = Number(entry.priceNet);
    if (timestamp === null || !Number.isFinite(value)) return;

    // In un archivio precedente alla regola append-only potrebbero esistere
    // due righe attive nello stesso giorno: per coerenza vince l'ultima letta.
    byDate.set(entry.validFrom, {
      id: entry.id,
      date: entry.validFrom,
      timestamp,
      value,
      inputIndex,
    });
  });

  const values = [...byDate.values()].sort(
    (a, b) => a.timestamp - b.timestamp || a.inputIndex - b.inputIndex,
  );
  if (values.length === 0) return null;

  const min = Math.min(...values.map((entry) => entry.value));
  const max = Math.max(...values.map((entry) => entry.value));
  const firstDate = values[0]!.timestamp;
  const lastDate = values.at(-1)!.timestamp;
  const plotWidth = Math.max(1, width - PADDING_X * 2);
  const plotHeight = Math.max(1, height - PADDING_Y * 2);
  const dateSpan = lastDate - firstDate;
  const valueSpan = max - min;

  const points = values.map<PriceChartPoint>((entry) => ({
    id: entry.id,
    date: entry.date,
    value: entry.value,
    x: round(
      dateSpan === 0
        ? PADDING_X + plotWidth / 2
        : PADDING_X + ((entry.timestamp - firstDate) / dateSpan) * plotWidth,
    ),
    y: round(
      valueSpan === 0
        ? PADDING_Y + plotHeight / 2
        : PADDING_Y + ((max - entry.value) / valueSpan) * plotHeight,
    ),
  }));

  const [first, ...rest] = points;
  const stepPath = rest.reduce(
    (path, point) => `${path} H ${point.x} V ${point.y}`,
    `M ${first!.x} ${first!.y}`,
  );

  return { points, stepPath, min, max };
}
