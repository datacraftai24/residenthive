// This is a compact version showing how the property cards should look
// To be merged back into agent-dual-view-search.tsx

/* Property Card - Zillow Style Horizontal Layout */
<Card key={property.mlsNumber} className="overflow-hidden">
  {/* Horizontal Layout: Photo 40% + Info 60% */}
  <div className="flex flex-col md:flex-row">
    {/* Photo Section (40%) */}
    <div className="md:w-2/5 relative min-h-[200px] md:min-h-[280px] bg-gray-100">
      {property.images && property.images.length > 0 ? (
        <div className="relative h-full">
          <img
            src={property.images[selectedImageIndex[property.mlsNumber] || 0]}
            alt={property.address}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => handleMainImageClick(property.mlsNumber, property.images.length)}
          />

          {/* Image Counter */}
          <div className="absolute top-3 right-3">
            <Badge className="bg-black/70 text-white">
              {(selectedImageIndex[property.mlsNumber] || 0) + 1} / {property.images.length}
            </Badge>
          </div>

          {/* Thumbnail strip */}
          {property.images.length > 1 && (
            <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto">
              {property.images.slice(0, 5).map((img, idx) => (
                <div
                  key={idx}
                  className={`w-12 h-8 rounded cursor-pointer ${
                    (selectedImageIndex[property.mlsNumber] || 0) === idx
                      ? 'ring-2 ring-white'
                      : 'opacity-70'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleImageClick(property.mlsNumber, idx);
                  }}
                >
                  <img src={img} className="w-full h-full object-cover rounded" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Home className="h-16 w-16 text-gray-400" />
        </div>
      )}

      {/* Fit Score Badge Overlay */}
      <div className="absolute top-3 left-3">
        <Badge className={`${getScoreColor(property.fitScore ?? property.matchScore ?? 0)} border font-semibold`}>
          {property.fitScore ?? property.matchScore ?? 0}% Fit
        </Badge>
      </div>

      {/* Selection Checkbox */}
      <div className="absolute bottom-3 left-3 bg-white rounded p-1.5 shadow">
        <Checkbox
          checked={selectedProperties.has(property.mlsNumber)}
          onCheckedChange={(checked) => {
            const newSelected = new Set(selectedProperties);
            if (checked) newSelected.add(property.mlsNumber);
            else newSelected.delete(property.mlsNumber);
            setSelectedProperties(newSelected);
          }}
        />
      </div>
    </div>

    {/* Info Section (60%) */}
    <div className="md:w-3/5 p-4 space-y-3">
      {/* Price + Address */}
      <div>
        <div className="text-2xl font-bold text-green-600">
          {formatPrice(property.listPrice)}
        </div>
        <div className="font-semibold text-gray-800 mt-1">
          {property.address}
        </div>
        <div className="text-sm text-gray-600">
          {property.city}, {property.state}
        </div>
      </div>

      {/* Specs Row */}
      <div className="flex items-center gap-4 text-sm text-gray-700">
        <div className="flex items-center gap-1">
          <Bed className="h-4 w-4" />
          {property.bedrooms} beds
        </div>
        <div className="flex items-center gap-1">
          <Bath className="h-4 w-4" />
          {property.bathrooms} baths
        </div>
        {property.sqft && (
          <div className="flex items-center gap-1">
            <Maximize className="h-4 w-4" />
            {property.sqft.toLocaleString()} sqft
          </div>
        )}
      </div>

      {/* One-line AI Summary */}
      {property.aiInsights?.personalizedAnalysis?.summary && (
        <div className="text-sm italic text-gray-600">
          "{property.aiInsights.personalizedAnalysis.summary}"
        </div>
      )}

      {/* Quick Scan Icons - COLLAPSED VIEW */}
      <div className="space-y-1">
        {/* Top 2 Match Reasons */}
        {property.matchReasons.slice(0, 2).map((reason, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs text-green-700">
            <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{reason}</span>
          </div>
        ))}

        {/* Top 2 Dealbreakers/Concerns */}
        {property.dealbreakers.slice(0, 2).map((concern, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{concern}</span>
          </div>
        ))}

        {/* Top 1 Hidden Gem */}
        {property.aiInsights?.personalizedAnalysis?.hiddenGems?.[0] && (
          <div className="flex items-start gap-2 text-xs text-purple-700">
            <Star className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">
              {property.aiInsights.personalizedAnalysis.hiddenGems[0]}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <Button size="sm" className="flex-1">
          <Share2 className="h-3 w-3 mr-1" />
          Share
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => toggleCard(property.mlsNumber)}
          className="flex items-center gap-1"
        >
          {expandedCards.has(property.mlsNumber) ? (
            <>Less <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>More <ChevronDown className="h-3 w-3" /></>
          )}
        </Button>
      </div>

      {/* Expandable Details Section */}
      {expandedCards.has(property.mlsNumber) && (
        <div className="border-t pt-3 mt-3 space-y-3">
          {/* Full AI Analysis */}
          {property.aiInsights?.personalizedAnalysis && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-semibold text-xs mb-2 text-blue-900">
                Why I Selected This Property
              </h4>
              <p className="text-xs text-gray-700">
                {property.aiInsights.personalizedAnalysis.summary}
              </p>
            </div>
          )}

          {/* All Hidden Gems */}
          {property.aiInsights?.personalizedAnalysis?.hiddenGems &&
           property.aiInsights.personalizedAnalysis.hiddenGems.length > 1 && (
            <div className="bg-purple-50 p-3 rounded">
              <h5 className="font-semibold text-xs mb-1 text-purple-900">
                💎 All Opportunities
              </h5>
              <ul className="text-xs text-purple-800 space-y-0.5">
                {property.aiInsights.personalizedAnalysis.hiddenGems.slice(1).map((gem, idx) => (
                  <li key={idx}>• {gem}</li>
                ))}
              </ul>
            </div>
          )}

          {/* All Match Reasons */}
          {property.matchReasons.length > 2 && (
            <div className="bg-green-50 p-2 rounded">
              <h5 className="font-semibold text-xs mb-1 text-green-900">
                All Verified Matches
              </h5>
              <ul className="text-xs text-green-800 space-y-0.5">
                {property.matchReasons.slice(2).map((reason, idx) => (
                  <li key={idx}>• {reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Info */}
          {property.aiInsights?.personalizedAnalysis?.missingInfo?.length > 0 && (
            <div className="bg-amber-50 p-2 rounded">
              <h5 className="font-semibold text-xs mb-1 text-amber-900">
                Information Needed
              </h5>
              <ul className="text-xs text-amber-800 space-y-0.5">
                {property.aiInsights.personalizedAnalysis.missingInfo.map((info, idx) => (
                  <li key={idx}>• {info}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Agent Tasks */}
          {property.aiInsights?.personalizedAnalysis?.agentTasks?.length > 0 && (
            <div className="bg-blue-50 p-2 rounded">
              <h5 className="font-semibold text-xs mb-1 text-blue-900">
                Agent To-Do
              </h5>
              <ul className="text-xs text-blue-800 space-y-0.5">
                {property.aiInsights.personalizedAnalysis.agentTasks.map((task, idx) => (
                  <li key={idx} className="flex gap-2">
                    <input type="checkbox" className="mt-0.5" />
                    <span>{task}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Score Breakdown */}
          <div className="bg-gray-50 p-2 rounded">
            <h5 className="font-semibold text-xs mb-2">Match Score Breakdown</h5>
            <div className="space-y-1">
              {Object.entries(property.scoreBreakdown).slice(0, 4).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
</Card>
