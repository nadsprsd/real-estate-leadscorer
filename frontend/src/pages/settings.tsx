import { useEffect, useState } from "react";
import {api} from "../lib/api";

export default function Settings(){

  const [connections,setConnections]=useState<any>(null);

  useEffect(()=>{

    api.get("/settings/connections")
      .then(res=>setConnections(res.data))

  },[])

  if(!connections)
    return <div>Loading...</div>

  return(

    <div>

      <h1 className="text-2xl mb-4">
        Settings
      </h1>

      <div className="bg-white p-4 rounded shadow">

        <div className="mb-2">

          Email Forwarding:

          <div className="font-mono">

            {connections.email_forwarding}

          </div>

        </div>

        <div>

          Webhook URL:

          <div className="font-mono">

            {connections.webhook_url}

          </div>

        </div>

      </div>

    </div>

  );
}
