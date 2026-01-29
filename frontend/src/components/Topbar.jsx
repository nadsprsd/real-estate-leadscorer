export default function Topbar() {
  return (
    <div className="h-16 border-b flex items-center justify-between px-6 bg-white">
      <div className="font-semibold">Real Estate Lead Scoring</div>

      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-600">BizGrowOnline.com</div>
        <div className="w-9 h-9 rounded-full bg-slate-300 flex items-center justify-center">
          👤
        </div>
      </div>
    </div>
  );
}
