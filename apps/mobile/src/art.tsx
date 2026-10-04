import React, { useState } from "react";
import { Image } from "react-native";
import Svg, {
  Path,
  Rect,
  Circle,
  Ellipse,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  G,
} from "react-native-svg";
import type { Artwork } from "./types";
export const artBackground: Record<Artwork, string> = {
  rice: "#F1EDDF",
  milk: "#EAF1F1",
  oil: "#F8F0DA",
  fruit: "#F5F0D8",
  vegetable: "#EDF3E6",
  soap: "#EAF1F0",
  bread: "#F4EBD9",
  bag: "#EEF0E2",
  snack: "#F7EBD9",
  tea: "#EBEFDE",
};
export function ProductArt({
  artwork = "bag",
  imageUrl = "",
  width = 150,
  height = 128,
}: {
  artwork?: Artwork;
  imageUrl?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed)
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width, height, resizeMode: "contain" }}
        onError={() => setFailed(true)}
        accessibilityLabel="Product image"
      />
    );
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 180 150"
      accessibilityLabel={`${artwork} product illustration`}
    >
      <Defs>
        <LinearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F4EBCD" />
          <Stop offset="1" stopColor="#D5BD85" />
        </LinearGradient>
        <LinearGradient id="bottle" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F6D365" />
          <Stop offset="0.6" stopColor="#EBC24C" />
          <Stop offset="1" stopColor="#D3A02B" />
        </LinearGradient>
        <LinearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#467D48" />
          <Stop offset="1" stopColor="#255B35" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="91" cy="133" rx="47" ry="7" fill="#183C21" opacity="0.11" />
      {artwork === "rice" && (
        <G>
          <Path d="M52 23l-4 13 5 93h76l5-93-6-13z" fill="url(#paper)" />
          <Path d="M129 23l5 13-5 93-9-3 2-90z" fill="#C7AA6B" />
          <Rect x="53" y="50" width="69" height="57" rx="3" fill="#315B3D" />
          <SvgText
            x="88"
            y="66"
            textAnchor="middle"
            fill="#EBDDAB"
            fontSize="7"
            letterSpacing="2"
          >
            AONE SELECT
          </SvgText>
          <SvgText
            x="88"
            y="85"
            textAnchor="middle"
            fill="white"
            fontWeight="bold"
            fontSize="15"
          >
            BASMATI
          </SvgText>
          <SvgText
            x="88"
            y="98"
            textAnchor="middle"
            fill="#DCE8CE"
            fontSize="9"
          >
            PREMIUM RICE
          </SvgText>
          <Path
            d="M65 117l4 4m8-4l5 3m13-4l4 4m8-3l4 4"
            stroke="#FDF9E9"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Path d="M51 29h77" stroke="#B59A62" strokeWidth="2" />
        </G>
      )}
      {artwork === "milk" && (
        <G>
          <Path d="M59 40l18-24h42l14 24v90H58z" fill="#EBF4F1" />
          <Path d="M77 16v24h42V16z" fill="#FBFDFC" />
          <Path d="M119 16l14 24v90h-14z" fill="#BBD8D2" />
          <Rect x="58" y="49" width="61" height="70" fill="#4D8782" />
          <Path d="M58 84c25-16 39 24 61 9v26H58z" fill="#DDE9D1" />
          <SvgText
            x="89"
            y="70"
            textAnchor="middle"
            fill="white"
            fontWeight="bold"
            fontSize="16"
          >
            MILK
          </SvgText>
          <SvgText x="89" y="82" textAnchor="middle" fill="white" fontSize="7">
            FRESH &amp; PURE
          </SvgText>
          <Circle cx="107" cy="36" r="6" fill="#FAFCF8" />
        </G>
      )}
      {artwork === "oil" && (
        <G>
          <Rect x="75" y="15" width="34" height="16" rx="4" fill="#335F39" />
          <Path
            d="M76 30v19L61 66v55q0 10 12 10h39q12 0 12-10V66l-16-17V30z"
            fill="url(#bottle)"
          />
          <Path
            d="M70 65v55"
            stroke="#FFF4BC"
            opacity="0.7"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <Rect x="62" y="78" width="61" height="39" rx="2" fill="#FFFBE6" />
          <Circle cx="93" cy="94" r="10" fill="#F0BA43" />
          <Circle cx="93" cy="94" r="5" fill="#66512B" />
          <SvgText
            x="92"
            y="110"
            textAnchor="middle"
            fontSize="6"
            fill="#526844"
          >
            SUNFLOWER OIL
          </SvgText>
        </G>
      )}
      {artwork === "fruit" && (
        <G>
          <Path
            d="M53 35c1 55 46 77 88 51-18 42-77 51-99 4-13-27-7-44 11-55z"
            fill="#F0C443"
          />
          <Path
            d="M69 26c0 49 31 80 71 69-27 34-77 24-84-17-5-26-2-37 13-52z"
            fill="#F8D759"
          />
          <Path d="M51 32l4-9 7 1-6 14M66 26l-2-10 8-2 4 14" fill="#5D7140" />
          <Path
            d="M47 52c-3 24 16 60 47 63"
            stroke="#D19C2F"
            strokeWidth="3"
            fill="none"
          />
        </G>
      )}
      {artwork === "vegetable" && (
        <G>
          <Circle cx="111" cy="67" r="32" fill="#D96446" />
          <Circle cx="74" cy="94" r="36" fill="#E37955" />
          <Circle cx="121" cy="105" r="26" fill="#CE593F" />
          <Path
            d="M72 60l-12 3 9 7-13 7 14 2 7 12 5-13 15 1-8-10 1-9-13 5z"
            fill="#547947"
          />
          <Path
            d="M108 32l-12 12 13-2 10 12 1-14 14-2-15-6-1-12z"
            fill="#466D3C"
          />
          <Path
            d="M55 97c-3-11 1-17 7-19"
            stroke="#F8B392"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </G>
      )}
      {artwork === "soap" && (
        <G>
          <Rect
            x="41"
            y="37"
            width="101"
            height="73"
            rx="18"
            fill="#D6E8DC"
            transform="rotate(-9 91 74)"
          />
          <Rect
            x="53"
            y="48"
            width="83"
            height="62"
            rx="14"
            fill="#8EBCAB"
            transform="rotate(-9 91 74)"
          />
          <Path d="M84 75c12-24 30-23 32-19-1 20-14 28-32 19z" fill="#D6E7D8" />
          <SvgText
            x="91"
            y="91"
            textAnchor="middle"
            fontSize="10"
            fill="#315F46"
            letterSpacing="2"
          >
            GENTLE
          </SvgText>
        </G>
      )}
      {artwork === "bread" && (
        <G>
          <Path d="M52 38l13-18h53l10 18 11 82-8 9H53l-6-11z" fill="#EEE0BB" />
          <Path d="M62 53q31-32 62 0v66H62z" fill="#AE723F" />
          <Path d="M69 56q24-20 48 0v57H69z" fill="#DDBA75" />
          <Rect x="49" y="72" width="87" height="33" fill="#476A44" />
          <SvgText
            x="92"
            y="87"
            textAnchor="middle"
            fill="white"
            fontSize="11"
            fontWeight="bold"
          >
            WHOLE WHEAT
          </SvgText>
          <SvgText
            x="92"
            y="99"
            textAnchor="middle"
            fill="#E9ECCC"
            fontSize="8"
          >
            FRESH BREAD
          </SvgText>
          <Path d="M65 25h55" stroke="#B18658" strokeWidth="4" />
        </G>
      )}
      {(artwork === "bag" || artwork === "snack" || artwork === "tea") && (
        <G>
          <Path
            d="M51 21l-3 12 6 97h77l5-97-5-12z"
            fill={
              artwork === "tea"
                ? "url(#leaf)"
                : artwork === "snack"
                  ? "#DE9850"
                  : "url(#paper)"
            }
          />
          <Path d="M126 22l10 11-5 97-9-3z" fill="#142C1D" opacity="0.12" />
          <Rect
            x="55"
            y="47"
            width="68"
            height="58"
            rx="3"
            fill={artwork === "tea" ? "#E0DCAF" : "#F5ECCC"}
          />
          <SvgText
            x="89"
            y="62"
            textAnchor="middle"
            fontSize="7"
            letterSpacing="1.5"
            fill="#56714A"
          >
            AONE SELECT
          </SvgText>
          <SvgText
            x="89"
            y="84"
            textAnchor="middle"
            fontSize="14"
            fontWeight="bold"
            fill="#395A39"
          >
            {artwork === "tea"
              ? "ASSAM TEA"
              : artwork === "snack"
                ? "CRUNCH"
                : "ESSENTIALS"}
          </SvgText>
          <SvgText
            x="89"
            y="98"
            textAnchor="middle"
            fontSize="7"
            fill="#56714A"
          >
            EVERYDAY GOODNESS
          </SvgText>
          <Path d="M53 27h78M55 122h73" stroke="#B6A870" strokeWidth="2" />
        </G>
      )}
    </Svg>
  );
}
