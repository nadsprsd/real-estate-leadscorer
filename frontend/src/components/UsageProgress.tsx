type Props = {
  used: number
  limit: number
}

export default function UsageProgress({ used, limit }: Props) {

  const percent = Math.min((used / limit) * 100, 100)

  return (

    <div className="bg-white border border-gray-200 rounded-lg p-4">

      <div className="flex justify-between text-sm mb-2">

        <span className="font-medium">
          Usage
        </span>

        <span className="text-gray-500">
          {used}/{limit}
        </span>

      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full">

        <div
          className="h-2 bg-[#00D4FF] rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />

      </div>

    </div>

  )
}
