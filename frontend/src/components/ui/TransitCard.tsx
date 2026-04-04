interface TransitStop {
  name: string;
  type: string;
  distance: string;
  lines?: string[];
}

interface TransitGroup {
  property: string;
  stops: TransitStop[];
}

interface TransitData {
  type: "transit";
  groups: TransitGroup[];
  source_note?: string;
}

const TYPE_ICONS: Record<string, string> = {
  subway: "🚇",
  train: "🚆",
  bus: "🚌",
  ferry: "⛴️",
};

export function TransitCard({ data }: { data: TransitData }) {
  return (
    <div className="text-sm">
      <p className="font-semibold text-gray-900 mb-3">Transit near your properties:</p>

      {data.groups.map((group, gi) => (
        <div key={gi} className="mb-4">
          <p className="font-bold text-xs text-gray-900 mb-1.5">{group.property}</p>
          {group.stops.map((stop, si) => (
            <div
              key={si}
              className="pl-2 border-l-2 border-gray-200 mb-2"
            >
              <p className="font-semibold text-xs text-gray-800">
                {TYPE_ICONS[stop.type] || "📍"} {stop.name}
              </p>
              <p className="text-xs text-gray-500">
                {stop.type} · {stop.distance}
                {stop.lines && stop.lines.length > 0 && (
                  <> · {stop.lines.join(", ")}</>
                )}
              </p>
            </div>
          ))}
        </div>
      ))}

      {data.source_note && (
        <p className="text-[10px] text-gray-400 italic mt-2">{data.source_note}</p>
      )}
    </div>
  );
}
