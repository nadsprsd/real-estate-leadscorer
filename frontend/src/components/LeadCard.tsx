export default function LeadCard({lead}:any){

  const badgeColor =
    lead.bucket==="HOT"
      ?"bg-[#00D4FF] text-black"
      :lead.bucket==="WARM"
      ?"bg-gray-400 text-black"
      :"bg-gray-400 text-black-600";

  return(

    <div className="
      bg-white
      border
      border-gray-200
      rounded-md
      p-4
      hover:shadow-sm
      transition
    ">

      <div className="flex justify-between items-start">

        <div>

          <div className="font-medium text-black text-sm">

            {lead.name || "Unknown Lead"}

          </div>

          <div className="text-xs text-black font-semibold mt-1">

            {lead.created_at}

          </div>

        </div>

        <div className={`
          text-xs
          px-2
          py-1
          rounded
          ${badgeColor}
        `}>
          {lead.bucket}
        </div>

      </div>

      <div className="
        text-sm
        text-black font-semibold
        mt-3
      ">
        {lead.message}
      </div>

      <div className="
        text-xs
        text-black font-semibold
        mt-2
      ">
        Score: {lead.score}
      </div>

      <div className="flex gap-2 mt-3">

        {lead.phone && (

          <a
            href={`tel:${lead.phone}`}
            className="
              text-xs
              border
              px-2
              py-1
              rounded
             text-black font-semibold
              hover:bg-gray-400
            "
          >
            Call
          </a>

        )}

        {lead.email && (

          <a
            href={`mailto:${lead.email}`}
            className="
              text-xs
              border
              px-2
              py-1
              rounded
               text-black font-semibold
              hover:bg-gray-400
            "
          >
            Email
          </a>

        )}

      </div>

    </div>

  )
}
