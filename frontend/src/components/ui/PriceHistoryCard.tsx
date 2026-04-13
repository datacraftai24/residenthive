interface HistoryEntry {
  date: string;
  price: string;
  event: string;
}

interface PriceHistoryProperty {
  address: string;
  current_price: string;
  history: HistoryEntry[];
}

interface PriceHistoryData {
  type: "price_history";
  properties: PriceHistoryProperty[];
}

const EVENT_COLORS: Record<string, string> = {
  Listed: "text-blue-600",
  Sold: "text-green-700",
  "Price reduced": "text-orange-600",
  "Price increased": "text-red-600",
  Delisted: "text-gray-500",
  Relisted: "text-blue-500",
};

export function PriceHistoryCard({ data }: { data: PriceHistoryData }) {
  return (
    <div className="text-sm">
      <p className="font-semibold text-gray-900 mb-3">Price History</p>

      {data.properties.map((prop, pi) => (
        <div key={pi} className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <p className="font-bold text-xs text-gray-900">{prop.address}</p>
            <p className="text-xs font-semibold text-green-700">{prop.current_price}</p>
          </div>

          <div className="space-y-1">
            {prop.history.map((entry, ei) => (
              <div
                key={ei}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-gray-400 w-16 flex-shrink-0">{entry.date}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                <span className={EVENT_COLORS[entry.event] || "text-gray-700"}>
                  {entry.event}
                </span>
                <span className="text-gray-600 font-medium">{entry.price}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
