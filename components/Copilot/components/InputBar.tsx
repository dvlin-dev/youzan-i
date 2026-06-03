import { Icon } from "@/components/icons";
import type { Role } from "@/lib/constants";

import { SUGG } from "../const";

export function InputBar({
  role,
  input,
  onInputChange,
  onSend,
}: {
  role: Role;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
}) {
  return (
    <div className="cop-foot">
      <div className="suggest">
        {SUGG[role].map((s) => (
          <button key={s} className="chip" onClick={() => onSend(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="cop-input">
        <textarea
          rows={1}
          value={input}
          placeholder="用一句话下指令…"
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(input);
            }
          }}
        />
        <button
          className="cop-send"
          onClick={() => onSend(input)}
          aria-label="发送"
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </div>
  );
}
