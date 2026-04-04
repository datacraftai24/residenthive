interface School {
  name: string;
  rating: string;
  distance: string;
  source?: string;
}

interface SchoolGroup {
  property: string;
  schools: School[];
}

interface SchoolData {
  type: "schools";
  disclaimer: string;
  groups: SchoolGroup[];
  source_note: string;
}

export function SchoolDataCard({ data }: { data: SchoolData }) {
  return (
    <div className="text-sm">
      {data.disclaimer && (
        <p className="text-xs text-gray-500 italic mb-3">{data.disclaimer}</p>
      )}

      <p className="font-semibold text-gray-900 mb-3">
        Nearby schools for your properties:
      </p>

      {data.groups.map((group, gi) => (
        <div key={gi} className="mb-4">
          <p className="font-bold text-xs text-gray-900 mb-1.5">{group.property}</p>
          {group.schools.map((school, si) => (
            <div
              key={si}
              className="pl-2 border-l-2 border-gray-200 mb-2"
            >
              <p className="font-semibold text-xs text-gray-800">{school.name}</p>
              <p className="text-xs text-gray-500">
                {school.rating} · {school.distance}
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
