type Lead = {
  id: string
  name?: string
  email?: string
  phone?: string
  message: string
  score: number
  bucket: string
  created_at: string
}

export default function LiveLeadCard({
  lead,
}: {
  lead: Lead
}) {

  const isHot = lead.bucket === "HOT"

  const badgeStyles = {
    HOT: "bg-[#00D4FF]/10 text-[#00D4FF]",
    WARM: "bg-yellow-100 text-yellow-700",
    COLD: "bg-gray-100 text-gray-600",
    IGNORE: "bg-gray-100 text-gray-400",
  }

  return (
    <div
      className={`
        bg-white border rounded-xl p-5 flex justify-between items-start
        transition hover:shadow-md
        ${isHot ? "border-[#00D4FF] shadow-sm shadow-[#00D4FF]/20" : ""}
      `}
    >

      {/* LEFT */}
      <div className="flex-1">

        <div className="flex items-center gap-2">

          <div className="font-semibold text-gray-900">
            {lead.name || "Unknown Lead"}
          </div>

          {isHot && (
            <div className="w-2 h-2 bg-[#00D4FF] rounded-full animate-pulse"></div>
          )}

        </div>

        <div className="text-sm text-gray-600 mt-1">
          {lead.message}
        </div>

        <div className="text-xs text-gray-400 mt-2">
          Score: {lead.score}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">

          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="text-xs px-3 py-1 border border-gray-300 rounded-md hover:border-black transition"
            >
              Call
            </a>
          )}

          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="text-xs px-3 py-1 border border-gray-300 rounded-md hover:border-black transition"
            >
              Email
            </a>
          )}

        </div>

      </div>

      {/* RIGHT BADGE */}
      <div
        className={`
          text-xs font-medium px-3 py-1 rounded-md
          ${badgeStyles[lead.bucket] || "bg-gray-100"}
        `}
      >
        {lead.bucket}
      </div>

    </div>
  )
}
