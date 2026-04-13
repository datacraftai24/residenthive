interface ComparisonProperty {
  address: string;
  price: string;
  beds: number | string;
  baths: number | string;
  sqft: string;
  fit_score?: number | null;
  strength: string;
}

interface ComparisonData {
  type: "comparison";
  properties: ComparisonProperty[];
}

export function ComparisonCard({ data }: { data: ComparisonData }) {
  const props = data.properties;

  if (!props || props.length === 0) return null;

  return (
    <div className="text-sm">
      <p className="font-semibold text-gray-900 mb-2">Property Comparison</p>

      <div className="overflow-x-auto -mx-1">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left py-1.5 px-2 bg-gray-50 font-semibold text-gray-600 border-b border-gray-200" />
              {props.map((p, i) => (
                <th
                  key={i}
                  className="text-left py-1.5 px-2 bg-gray-50 font-semibold text-gray-600 border-b border-gray-200 min-w-[100px]"
                >
                  #{i + 1} {p.address.split(",")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Price" values={props.map((p) => p.price)} highlight="lowest" />
            <Row label="Beds" values={props.map((p) => String(p.beds))} highlight="highest" />
            <Row label="Baths" values={props.map((p) => String(p.baths))} highlight="highest" />
            <Row label="Sqft" values={props.map((p) => p.sqft)} highlight="highest" />
            {props.some((p) => p.fit_score) && (
              <Row
                label="Fit"
                values={props.map((p) => p.fit_score ? `${p.fit_score}%` : "—")}
                highlight="highest"
              />
            )}
            <tr>
              <td className="py-1.5 px-2 font-semibold text-gray-600 border-b border-gray-100">
                Strength
              </td>
              {props.map((p, i) => (
                <td key={i} className="py-1.5 px-2 text-gray-700 border-b border-gray-100">
                  {p.strength}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  label,
  values,
  highlight,
}: {
  label: string;
  values: string[];
  highlight: "highest" | "lowest";
}) {
  // Find the best value index for highlighting
  const numericValues = values.map((v) => {
    const n = parseFloat(v.replace(/[$,%,]/g, ""));
    return isNaN(n) ? null : n;
  });

  let bestIdx = -1;
  if (numericValues.some((v) => v !== null)) {
    const filtered = numericValues.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
    if (filtered.length > 0) {
      if (highlight === "highest") {
        bestIdx = filtered.reduce((a, b) => ((b.v ?? 0) > (a.v ?? 0) ? b : a)).i;
      } else {
        bestIdx = filtered.reduce((a, b) => ((b.v ?? Infinity) < (a.v ?? Infinity) ? b : a)).i;
      }
    }
  }

  return (
    <tr>
      <td className="py-1.5 px-2 font-semibold text-gray-600 border-b border-gray-100">
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`py-1.5 px-2 border-b border-gray-100 ${
            i === bestIdx ? "font-bold text-green-700" : "text-gray-700"
          }`}
        >
          {v}
          {i === bestIdx && " ⭐"}
        </td>
      ))}
    </tr>
  );
}
